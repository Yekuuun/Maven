---
name: verifier-loops
description: Use when an eBPF program fails verification or runs into complexity limits because of a loop, or when it scans or copies a buffer (user memory, strings, packets, rodata): homemade strlen, strstr, memcmp, pattern search, bpf_probe_read_user loops. Also use for verifier errors like "unbounded variable-offset read", "invalid access to map value", "back-edge", or "processed N insns (limit 1000000)". Covers when to use a native for loop vs bpf_loop(), nested loops, bounds that do not carry into callbacks, and the power-of-two mask idiom.
---

# Verifier loops and buffer bounds

The verifier does not prove loops mathematically. It replays each iteration as a new state and
prunes a state when it has already seen an identical one. A loop whose states never repeat is
replayed until the real bound runs out, or until the program passes
`BPF_COMPLEXITY_LIMIT_INSNS` (1,000,000 processed instructions) and is rejected. Most loop
problems come from that one fact: the verifier must see the same state twice to stop.

This skill covers loops and buffer bounds. General verifier rules, attach lifecycle and CO-RE
live in `ebpf:ebpf-review`. Map selection lives in `ebpf:map-expert`.

## Symptoms

- A verifier log of thousands of lines, the same block repeated, with a loop index that rises by
  one each time (`R3_w=31`, `R3_w=32`, `R3_w=33`...).
- `processed N insns (limit 1000000)` as the last line before `END PROG LOAD LOG`.
- `invalid unbounded variable-offset read from stack`
- `invalid access to map value, value_size=N off=N size=1` with `R8 min value is outside of the
  allowed memory range`
- `back-edge` or `infinite loop detected` on a loop that is actually bounded

## Choose the loop form first

Work through these in order. Stop at the first match.

1. **Constant bound, small.** Native `for` with `#pragma unroll`. The verifier sees the same
   code each time and the bound is known.
2. **Runtime bound** (a value read from a map, a context, a user buffer, or a computed length).
   Use `bpf_loop(nr_loops, callback, ctx, 0)`, not a native `for`. The callback is verified once
   as a subprogram, whatever `nr_loops` is. Requires kernel 5.17+.
3. **Two runtime loops nested.** Move at least the outer loop into `bpf_loop()`. Nested native
   loops with runtime bounds cost roughly O(N²) in verification work, because the inner loop is
   replayed for every outer iteration. Moving both into `bpf_loop()` is the safest option.
4. **Native loop with a runtime bound that you cannot move to a callback.** Clamp the bound to a
   compile-time maximum first (`if (n > MAX) n = MAX;`), then use the clamped value in the loop
   condition. Only do this when the clamp is correct for the program's semantics.

## Keep the loop condition simple

Compound conditions defeat pruning. The verifier can track a loop index as a clean range only if
the exit condition is a single bound on that index.

```c
/* BAD: arithmetic and content criteria mixed in one condition */
for (__u32 i = 0; i + nlen < to_read && buff[i] != '\0'; i++) { ... }

/* GOOD: the loop bounds i, the content check lives in the body */
for (__u32 i = 0; i < to_read; i++) {
    if (i + nlen >= to_read)
        break;
    if (buff[i] == '\0')
        break;
    ...
}
```

Move business logic such as end-of-string or match checks out of the loop condition. Keep the
index bounded by a single comparison.

## Bounds do not travel

A bound the verifier proved in one place is not known in another. There are three cases.

**Across a callback.** A bound proven before `bpf_loop()` is not known inside the callback:

```c
ctx.l2 = ft_strlen(s2, MAX_STR_LEN);   /* bounded here */
bpf_loop(MAX_STR_LEN, __step, &ctx, 0);
/* inside __step: ctx->l2 is re-read from memory, the bound is gone */
```

Re-prove the bound inside the callback, or put a clamp right before each use:

```c
static long __step(__u32 i, void *data)
{
    struct ctx *c = data;
    __u32 l2 = c->l2;
    if (l2 > MAX_STR_LEN)
        return 1;                /* stop: out of range */
    ...
}
```

**Across an `if` at a distance.** An `if (i + NLEN > to_read) return 1;` protects only the access
that follows on the same proof path. A later `buff[i + j]` in an inner unrolled loop starts over
with `i` unbounded. Mask every access (see below).

**Source buffers with no statically known size.** Merged `.rodata`, user memory, and arbitrary
pointers do not have a size the compiler can see. An index into them is unprovable. Copy first:

```c
struct ctx {
    char needle[MAX_LEN];        /* fixed size, known to the compiler */
};

bpf_probe_read_kernel_str(ctx.needle, sizeof(ctx.needle), src_ptr);
/* now ctx.needle[j] with j < MAX_LEN is statically provable */
```

`bpf_probe_read_user` and `bpf_probe_read_kernel_str` need proof only about the destination. The
kernel handles faults and the source's extent. This is the reason they are the right tool for
the copy.

## The power-of-two mask idiom

When a bound is known in the program but the verifier has lost it, re-prove it at each access
with a mask. `BUFF_READ` must be a power of two.

```c
/* bad: relies on a bound the verifier may have forgotten */
sctx->buff[i + j]

/* good: bounded by construction at every access */
__u32 idx = (i + j) & (BUFF_READ - 1);
sctx->buff[idx]
```

The mask is a proof device, not a behaviour change. It wraps the index back to zero if it
exceeds the power of two. Before using it, make sure an earlier check (`if (i + NLEN > to_read)
return 1;`) guarantees the wraparound never happens at runtime. If the wraparound can happen,
the mask changes the program's meaning, and the fix is to bound the logic, not to mask it.

## Compiler and inlining

A call that the compiler does not inline can become a call to an external symbol that the
verifier cannot resolve. `__builtin_memcmp` is the usual case. Check these:

- Build with `-O2`. Never `-O0` for BPF objects.
- Use `__always_inline` on helper functions called from the program.
- For byte comparisons, a manually unrolled loop over a constant length is safer than
  `__builtin_memcmp` with a runtime length.

## Checklist before writing a loop over a buffer

- [ ] Is the bound a compile-time constant? Use a native `for` with `#pragma unroll`, if small.
- [ ] Does the bound depend on a runtime value? Use `bpf_loop()`, not a native `for`.
- [ ] Are two runtime loops nested? Move at least the outer loop into `bpf_loop()`.
- [ ] Is the source buffer of unknown size? Copy it into a fixed local array first.
- [ ] Does an access inside a callback or an inner loop rely on a bound proven elsewhere? Clamp
      or mask the index locally at that access.
- [ ] Is the exit condition compound? Simplify it and move secondary checks into the body.
- [ ] Does the code call anything that might not inline? Confirm `-O2` and use `__always_inline`.

## Reading the log

Save the full loader output to a file. Terminal scrollback loses the start of the log, and the
real message is usually near the end.

```bash
sudo ./loader > /tmp/out.log 2> /tmp/err.log
tail -n 100 /tmp/err.log
grep -n -iE "invalid|exceed|too large|unbounded|permission|processed.*insns" /tmp/err.log
```

The last diagnostic line before `-- END PROG LOAD LOG --` is the one to act on. It is either a
precise error (`invalid access...`, `unbounded variable-offset...`) or the
`processed N insns (limit 1000000)` line. The second means a complexity overflow, not a memory
bug, so the fix is in the loop structure, not in the access.

If the log is not enough to tell which access failed, ask for the `llvm-objdump -S` output of
the object rather than guessing at the instruction.
