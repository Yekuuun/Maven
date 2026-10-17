---
name: map-expert
description: Use when choosing, declaring, or using an eBPF map: picking a BPF_MAP_TYPE_* for counters, keyed state, arrays, event streams to userspace, tail calls, socket or XDP redirection, or per-task and per-inode storage. Also use when map lookups, updates, pinning, sizing, or map-full errors come up in libbpf code, whether kernel-side or userspace. Covers per-CPU semantics, LRU eviction, ringbuf vs perf buffers, and the map APIs.
---

# Map expert

Maps are the only state that survives between eBPF program invocations and the only shared
memory between a BPF program and userspace. The map type decides the access semantics, the
concurrency behaviour, and the memory cost, so choose it before writing the program.

This skill covers map selection and map usage. For general verifier rules and attach
lifecycle, see `ebpf:ebpf-review`. For general C rules, see `c:c-memory-safety-review`.

## Pick the type

Start from what the data is, then check the kernel version floor in the reference file.

| Need | Type | Why |
| --- | --- | --- |
| High-frequency counter or metric, read from userspace | `PERCPU_ARRAY` | No cross-CPU contention. Userspace sums the per-CPU slots. |
| Per-key counter with many keys | `PERCPU_HASH` | Same, keyed. |
| Keyed state shared across CPUs (flow table, config by key) | `HASH` | One logical value per key. Use a `bpf_spin_lock` in the value for compound updates. |
| Keyed state that must never fail on insert | `LRU_HASH` | Evicts the least recently used entry when full. |
| Fixed-size table indexed by an integer | `ARRAY` | Pre-allocated, always-present slots, no deletes. |
| Event stream to userspace (kernel to user) | `RINGBUF` | One shared buffer, ordered, efficient. Kernel 5.8+. |
| Event stream on older kernels | `PERF_EVENT_ARRAY` | One buffer per CPU. Works on old kernels, more memory and more code. |
| Jump to another BPF program (tail call) | `PROG_ARRAY` | Array of program fds, used with `bpf_tail_call`. |
| Per-task, per-socket, per-inode, or per-cgroup data | `TASK_STORAGE`, `SK_STORAGE`, `INODE_STORAGE`, `CGRP_STORAGE` | Attached to the object, freed with it, no key management. |
| Stack traces for profiling | `STACK_TRACE` | Stores stack IDs. Pair with a hash map keyed by the ID. |
| Redirect packets (XDP/TC) | `DEVMAP`, `CPUMAP`, `XSKMAP`, `SOCKMAP`, `SOCKHASH` | Redirect targets: devices, CPUs, AF_XDP sockets, sockets. |
| Membership test with false positives | `BLOOM_FILTER` | Kernel 5.16+. Constant memory, no deletes. |
| Longest-prefix match (IP routes, CIDR rules) | `LPM_TRIE` | Key carries a prefix length. |
| FIFO or LIFO work queue | `QUEUE`, `STACK` | No key. Push, pop, peek. |

Decision rule of thumb: if the value is a number that userspace only reads and sums, use a
per-CPU type. If the value is an object that one program updates and userspace reads, use a
plain type. If the value is an event, use a ring buffer.

## Usage rules

- **Always null-check lookups.** `bpf_map_lookup_elem` returns `NULL` for a missing key on
  hash-like maps, and the verifier rejects a dereference without a check. This includes
  `ARRAY`, which the verifier still treats as nullable.
- **Set `max_entries` explicitly.** It is fixed at load time for most types. Size it to the
  real working set, not an arbitrary power of two. Hash maps preallocate by default. See
  the reference for `BPF_F_NO_PREALLOC`.
- **Handle update failure.** `bpf_map_update_elem` on a full `HASH` returns `-E2BIG`. Count
  the drops in a per-CPU counter instead of silently ignoring them.
- **Choose update flags on purpose.** `BPF_ANY` (create or replace), `BPF_NOEXIST` (create
  only), `BPF_EXIST` (replace only). `ARRAY` entries always exist, so `BPF_NOEXIST` always
  fails on them.
- **Per-CPU values are per CPU.** The kernel-side program writes only its own CPU's slot.
  Userspace must read a buffer of `libbpf_num_possible_cpus()` values, each rounded up to 8
  bytes. Summing is the caller's job.
- **Ring buffer reservations must be released.** Every `bpf_ringbuf_reserve` needs a
  matching `bpf_ringbuf_submit` or `bpf_ringbuf_discard` on every path. Otherwise the
  verifier reports `unreleased reference`. Prefer `bpf_ringbuf_output` when the event is
  small and built in one piece.
- **Do not keep map value pointers across helper calls that may delete the entry.** The
  pointer is valid only while the element exists.
- **Pin maps you share between programs or processes.** Pin under `/sys/fs/bpf/` with
  `bpf_map__pin` or `LIBBPF_PIN_BY_NAME` and reopen with `bpf_obj_get`. Without a pin, the
  map lives only as long as its fd.
- **Maps are created at load time.** Most types cannot be resized after creation. Plan the
  size in the skeleton, not at runtime.

## Userspace basics

Use the libbpf skeleton (`bpftool gen skeleton`) and the generated accessors where possible.
The raw API is still needed for per-CPU reads and for iteration:

- `bpf_map__lookup_elem` / `bpf_map_lookup_elem` on a per-CPU map fills a buffer of
  `nr_cpus` values.
- `bpf_map_get_next_key` iterates keys. Start from a zeroed key (or `NULL` for the first
  key). Deleting while iterating can skip entries, so snapshot first if you need
  consistency.
- Ring buffers are consumed with `ring_buffer__new` and `ring_buffer__poll`. Perf buffers
  use `perf_buffer__new` and `perf_buffer__poll`. Do not mix the two APIs on one map.

## Common failures

- `invalid mem access 'map_value_or_null'`: missing null check after lookup.
- `invalid access to map value, value_size=N off=N`: the index into the value is not provably
  bounded. See `ebpf:verifier-loops` for masks and bounds across callbacks.
- `unreleased reference id=N`: a ringbuf reservation that is not submitted or discarded on
  every path, often on an early `return`.
- `R1 invalid mem access 'inv'` on a map value: value struct size does not match the
  `__type(value, ...)` declared in the map definition.
- Userspace reads zeros or garbage from a per-CPU map: the buffer is sized for one CPU or
  is not rounded to 8 bytes per value.
- `-E2BIG` on update: the `HASH` is full. Raise `max_entries`, switch to `LRU_HASH` if
  eviction is acceptable, or drop and count.
- `-EINVAL` on load for `LPM_TRIE`: the key lacks a `prefixlen` field or the map was created
  without `BPF_F_NO_PREALLOC`.
- `-EPERM` on a map operation from userspace: the process lacks `CAP_BPF` (or
  `CAP_SYS_ADMIN` on kernels before 5.8), or the map was frozen with `bpf_map__freeze` so
  userspace can no longer write it. A program write to a `BPF_F_RDONLY_PROG` map fails at
  load time with a verifier error, not at runtime.

## Reference

Read `references/map-types.md` when you need the exact kernel version for a type, its key
and value rules, its flags, or a code snippet for a type not covered above. It holds the
full catalogue, including the `_OF_MAPS` containers, storage maps and the newer arena map.
