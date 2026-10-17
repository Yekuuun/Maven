---
name: ebpf-review
description: Use when writing or reviewing eBPF programs (kernel-side C with libbpf, CO-RE, maps, ring buffers, tracepoints, kprobes, XDP, TC), or when the verifier rejects a program. Covers verifier-friendly code, map and ringbuf patterns, CO-RE portability and attach lifecycle. Assumes the general C rules from the c plugin.
---

# eBPF review

This skill covers only what is specific to BPF. General C memory-safety rules belong to the
`c` plugin's `c-memory-safety-review` skill.

## Verifier-friendliness

- Every loop has a constant bound, or uses `bpf_loop()` on kernels that support it. Nested
  runtime loops are a complexity problem, not only a correctness one. For the full rules,
  use the `ebpf:verifier-loops` skill.
- Every pointer from a context or a map lookup is null-checked before it is dereferenced.
- Packet access is bounds-checked against `data_end` in the same scope the verifier sees.
- Stack usage stays under 512 bytes. Move large buffers into a per-CPU array map.
- Only BPF helpers and `static __always_inline` functions are called from the program.

## Maps and events

- Pick the map type on purpose: `HASH` for keyed state, `PERCPU_*` for counters,
  `RINGBUF` for event streams (preferred over `PERF_EVENT_ARRAY` where supported).
  For the full selection and usage rules, use the `ebpf:map-expert` skill.
- Set `max_entries` explicitly, and handle `bpf_map_update_elem` failure (map full).
- Keep the userspace struct layout identical to the kernel struct. Use packed structs only
  with a size assertion.

## CO-RE and portability

- Read kernel struct fields with `BPF_CORE_READ`. Never hardcode offsets.
- Guard fields that may be absent with `bpf_core_field_exists` or `bpf_core_type_exists`.
- Generate `vmlinux.h` from BTF. Do not include kernel headers directly in BPF code.

## Attach and lifecycle

- Name the attach point and note the minimum kernel version in a comment.
- Userspace detaches and closes links on exit, including on signals.

## Verifier rejections

When loading fails, find the first `error` or `invalid` line in the verifier log, read the
register state printed just before it, and map the message to its rule:

- `invalid mem access 'map_value_or_null'`: missing null check after a map lookup.
- `invalid access to packet`: packet read not bounded by `data_end`.
- `back-edge` or `infinite loop detected`: loop bound not provable. Check whether the loop
  has a runtime bound or a compound exit condition, then see `ebpf:verifier-loops`.
- `processed N insns (limit 1000000)`: complexity overflow. The loop is probably replayed per
  iteration. Move it into `bpf_loop()`, see `ebpf:verifier-loops`.
- `invalid unbounded variable-offset read from stack`: an index lost its bound. Mask it with
  `& (POWER_OF_2 - 1)` at the access, see `ebpf:verifier-loops`.
- `invalid access to map value, value_size=N off=N size=M`: the index used is not provably
  inside the value. Check bounds at the access, not only earlier in the function.
- `unreleased reference`: a ringbuf reservation not submitted or discarded on every path.
- `the sequence of N insns is too large` or `combined stack size`: program or stack too large.
- `unknown func` or `helper not allowed`: helper unavailable for this program type or kernel.

Report the rule, the smallest code change that satisfies it, and the kernel version the fix
assumes. If the log is not enough, ask for `llvm-objdump -S` output rather than guessing.
Always capture the loader output to a file and read the end of it, as terminal scrollback
loses the start of long logs.
