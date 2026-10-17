# eBPF map types: reference

Load this file when `map-expert` needs the exact semantics, the kernel version floor, or a
snippet for a type. Kernel versions are the first release that supports the type. Check the
target kernel before relying on a newer type.

## Contents

1. Hash maps
2. Arrays
3. Kernel to userspace channels
4. Redirection maps (network)
5. Program and container maps
6. Storage maps (attached to kernel objects)
7. Specialised maps
8. Flags and update semantics
9. Userspace access patterns
10. Decision flow

---

## 1. Hash maps

| Type | Since | Semantics |
| --- | --- | --- |
| `BPF_MAP_TYPE_HASH` | 3.19 | Keyed, shared by all CPUs. Lookups are lock-free (RCU). Updates take a per-bucket lock. Full map rejects inserts with `-E2BIG`. |
| `BPF_MAP_TYPE_PERCPU_HASH` | 4.6 | Keyed, one value slot per CPU. A program update touches only its CPU's slot. Userspace reads all slots. |
| `BPF_MAP_TYPE_LRU_HASH` | 4.10 | Like `HASH`, but when full it evicts the least recently used element instead of failing. Good for caches and flow tables where losing old entries is acceptable. |
| `BPF_MAP_TYPE_LRU_PERCPU_HASH` | 4.10 | LRU eviction with per-CPU values. |

Notes:
- LRU eviction is approximate and per-CPU-list based. Do not rely on exact recency.
- A `HASH` that must never drop entries needs `max_entries` sized for the peak. Count
  failed inserts.
- `bpf_spin_lock` in the value struct is supported for `HASH` and `ARRAY`, for protecting
  multi-field updates. It is not supported for per-CPU types, where it is not needed.

```c
struct flow_key { __u32 saddr; __u32 daddr; __u16 sport; __u16 dport; };
struct flow_val { __u64 packets; __u64 bytes; };

struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 65536);
    __type(key, struct flow_key);
    __type(value, struct flow_val);
} flows SEC(".maps");

static __always_inline void account(struct flow_key *k, __u64 len)
{
    struct flow_val *v = bpf_map_lookup_elem(&flows, k);
    if (v) {
        __sync_fetch_and_add(&v->packets, 1);
        __sync_fetch_and_add(&v->bytes, len);
        return;
    }
    struct flow_val init = { .packets = 1, .bytes = len };
    bpf_map_update_elem(&flows, k, &init, BPF_NOEXIST);
}
```

The race in `account` is intentional: two CPUs can both miss and both insert. `BPF_NOEXIST`
makes the loser fail, and its packet is then not counted. For exact counts, use
`BPF_ANY` with a fresh lookup, or a `PERCPU_HASH`.

## 2. Arrays

| Type | Since | Semantics |
| --- | --- | --- |
| `BPF_MAP_TYPE_ARRAY` | 3.19 | Integer-indexed, fully pre-allocated, fixed size. Every index in range always exists. Elements cannot be deleted. |
| `BPF_MAP_TYPE_PERCPU_ARRAY` | 4.6 | Same, one value per CPU per index. The canonical choice for metrics. |
| `BPF_MAP_TYPE_PROG_ARRAY` | 4.2 | Index to program fd. Used with `bpf_tail_call` for chaining (max 33 tail calls deep). |

Notes:
- `ARRAY` lookups never return a truly missing element, but the verifier still requires a
  null check.
- `PROG_ARRAY` slots are filled from userspace (`bpf_map_update_elem` with a program fd).
  An empty slot makes the tail call fall through, so check the return value of
  `bpf_tail_call`.

```c
struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 256);
    __type(key, __u32);
    __type(value, __u64);
} pkt_count SEC(".maps");

SEC("xdp")
int count(struct xdp_md *ctx)
{
    __u32 idx = 0;
    __u64 *c = bpf_map_lookup_elem(&pkt_count, &idx);
    if (c)
        (*c)++;          /* plain increment is safe: this CPU owns the slot */
    return XDP_PASS;
}
```

Userspace must read the per-CPU values as an array of `nr_cpus` entries (see section 9).

## 3. Kernel to userspace channels

| Type | Since | Semantics |
| --- | --- | --- |
| `BPF_MAP_TYPE_RINGBUF` | 5.8 | One shared circular buffer, ordered, efficient. Use it by default. Size must be a power of two and a multiple of the page size. |
| `BPF_MAP_TYPE_USER_RINGBUF` | 6.1 | Userspace to kernel direction, drained by the BPF program with `bpf_user_ringbuf_drain`. |
| `BPF_MAP_TYPE_PERF_EVENT_ARRAY` | 4.3 | One perf buffer per CPU, sent with `bpf_perf_event_output`. Older and more memory-hungry, but works on pre-5.8 kernels. Events from one CPU are ordered; across CPUs they are not. |

Ring buffer rules:
- Reserve, fill, then submit or discard. Every path must release the reservation.
- `bpf_ringbuf_output` copies a prepared struct in one call, which avoids the reserve
  bookkeeping for small events.
- Full ring: reserve returns `NULL`. Count the drop; do not spin.
- Userspace: `ring_buffer__new(map_fd, cb, ctx, NULL)` then `ring_buffer__poll(rb, timeout)`.

```c
struct event { __u32 pid; __u8 comm[16]; };

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 256 * 1024);    /* 256 KiB: power of two, page multiple */
} events SEC(".maps");

SEC("tp/sched/sched_process_exec")
int on_exec(void *ctx)
{
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e)
        return 0;                       /* full: drop, do not block */
    e->pid = bpf_get_current_pid_tgid() >> 32;
    bpf_get_current_comm(e->comm, sizeof(e->comm));
    bpf_ringbuf_submit(e, 0);
    return 0;
}
```

## 4. Redirection maps (network)

| Type | Since | Used with | Holds |
| --- | --- | --- | --- |
| `BPF_MAP_TYPE_DEVMAP` | 4.14 | `bpf_redirect_map` in XDP | Network device ifindex. |
| `BPF_MAP_TYPE_DEVMAP_HASH` | 5.4 | same | Device by arbitrary key. |
| `BPF_MAP_TYPE_CPUMAP` | 4.15 | `bpf_redirect_map` in XDP | CPU index; packets are handed to that CPU's stack. |
| `BPF_MAP_TYPE_XSKMAP` | 4.18 | `bpf_redirect_map` in XDP | AF_XDP socket per RX queue. Zero-copy path. |
| `BPF_MAP_TYPE_SOCKMAP` | 4.14 | `bpf_sk_redirect_map`, `bpf_msg_redirect_map` | Sockets by index. |
| `BPF_MAP_TYPE_SOCKHASH` | 4.18 | same | Sockets by key. |
| `BPF_MAP_TYPE_REUSEPORT_SOCKARRAY` | 4.19 | `bpf_sk_select_reuseport` | Sockets for reuseport group selection. |

Notes:
- Redirect maps are populated from userspace with fds or ifindexes. The redirect helper
  returns the action (`XDP_REDIRECT` or a fallback) and the map's flags pick the fallback.
- `XSKMAP` entries are only valid while the AF_XDP socket is bound to that queue.

## 5. Program and container maps

| Type | Since | Semantics |
| --- | --- | --- |
| `BPF_MAP_TYPE_ARRAY_OF_MAPS` | 4.12 | Array whose values are map fds. Inner maps must share a template. |
| `BPF_MAP_TYPE_HASH_OF_MAPS` | 4.12 | Hash whose values are map fds. Used for per-key tables (per-container, per-pid). |

Notes:
- Declare the inner map template in the outer map's `__array(values, ...)` or
  `__inner` definition (libbpf). From userspace, replace an inner map by updating the outer
  entry with the new map's fd.
- Inner maps are freed when the outer entry is deleted or replaced.

## 6. Storage maps (attached to kernel objects)

These replace hash maps keyed by pid, socket, inode, or cgroup. The data lives with the
object and is freed with it, so there is no leak and no key to manage.

| Type | Since | Attached to | Get / create helper |
| --- | --- | --- | --- |
| `BPF_MAP_TYPE_CGROUP_STORAGE` | 4.19 | cgroup + attach type | `bpf_get_local_storage`. For new code, prefer `CGRP_STORAGE`. |
| `BPF_MAP_TYPE_PERCPU_CGROUP_STORAGE` | 4.19 | cgroup, per CPU | same. |
| `BPF_MAP_TYPE_SK_STORAGE` | 5.2 | `struct sock` | `bpf_sk_storage_get(map, sk, val, flags)` |
| `BPF_MAP_TYPE_INODE_STORAGE` | 5.10 | `struct inode` | `bpf_inode_storage_get` |
| `BPF_MAP_TYPE_TASK_STORAGE` | 5.11 | `struct task_struct` | `bpf_task_storage_get(map, task, val, flags)` |
| `BPF_MAP_TYPE_CGRP_STORAGE` | 6.2 | `struct cgroup` | `bpf_cgrp_storage_get` |

Notes:
- Pass `BPF_LOCAL_STORAGE_GET_F_CREATE` to create the entry on first access. Without it,
  a missing entry returns `NULL`.
- Use `bpf_task_storage_delete` / `bpf_sk_storage_delete` to remove early; otherwise the
  entry goes away with the object.
- `task_storage` is usually the right replacement for a `HASH` keyed by pid.

```c
struct {
    __uint(type, BPF_MAP_TYPE_TASK_STORAGE);
    __uint(map_flags, BPF_F_NO_PREALLOC);
    __type(key, int);
    __type(value, __u64);
} task_start SEC(".maps");

/* in a program: */
__u64 *ts = bpf_task_storage_get(&task_start, task, 0, BPF_LOCAL_STORAGE_GET_F_CREATE);
```

## 7. Specialised maps

| Type | Since | Semantics |
| --- | --- | --- |
| `BPF_MAP_TYPE_STACK_TRACE` | 4.6 | Stores kernel/user stacks; returns a stack id from `bpf_get_stackid`. Key is the id, value is the trace. Pair with a counter hash keyed by id. |
| `BPF_MAP_TYPE_LPM_TRIE` | 4.11 | Longest-prefix match. Key is `struct bpf_lpm_trie_key { __u32 prefixlen; __u8 data[]; }`. Needs `BPF_F_NO_PREALLOC`. |
| `BPF_MAP_TYPE_QUEUE` | 4.20 | FIFO, no key. `bpf_map_push_elem`, `bpf_map_pop_elem`, `bpf_map_peek_elem`. |
| `BPF_MAP_TYPE_STACK` | 4.20 | LIFO, no key. Same helpers. |
| `BPF_MAP_TYPE_BLOOM_FILTER` | 5.16 | Probabilistic membership. `bpf_map_peek_elem` tests, `bpf_map_push_elem` adds. No delete; false positives possible. |
| `BPF_MAP_TYPE_STRUCT_OPS` | 5.6 | Holds a struct of function pointers (e.g. TCP congestion control). Not a data map; registered with the kernel. |
| `BPF_MAP_TYPE_ARENA` | 6.9 | Shared memory region mappable by both the BPF program and userspace, with pointers valid on both sides. Newest; check the verifier and libbpf version you target. |

```c
struct lpm_key { __u32 prefixlen; __u32 addr; };

struct {
    __uint(type, BPF_MAP_TYPE_LPM_TRIE);
    __uint(max_entries, 1024);
    __uint(map_flags, BPF_F_NO_PREALLOC);
    __type(key, struct lpm_key);
    __type(value, __u32);
} allowlist SEC(".maps");
```

## 8. Flags and update semantics

Map creation flags (`map_flags` in the definition):

| Flag | Meaning |
| --- | --- |
| `BPF_F_NO_PREALLOC` | Allocate elements on demand, not up front. Required for `LPM_TRIE`. Saves memory for sparse hash maps. |
| `BPF_F_RDONLY_PROG` | The program cannot write the map. Userspace still can. |
| `BPF_F_WRONLY_PROG` | The program can write but not read. Rare. |
| `BPF_F_MMAPABLE` | Userspace can `mmap` the array's values (array maps only). Avoids syscalls for reads. |
| `BPF_F_INNER_MAP` | Marks a map as a template for `*_OF_MAPS`. |

Update flags (`bpf_map_update_elem` `flags` argument):

| Flag | Meaning |
| --- | --- |
| `BPF_ANY` (0) | Create or replace. |
| `BPF_NOEXIST` (1) | Create only. Fails if the key exists. Always fails on `ARRAY` types. |
| `BPF_EXIST` (2) | Replace only. Fails if the key is missing. |

## 9. Userspace access patterns

```c
#include <bpf/libbpf.h>
#include <bpf/bpf.h>

/* Sum a per-CPU counter from userspace */
int nr_cpus = libbpf_num_possible_cpus();
if (nr_cpus < 0)
    return nr_cpus;
__u64 *vals = calloc(nr_cpus, sizeof(__u64));   /* 8-byte values, so no padding */
__u32 key = 0;
if (bpf_map_lookup_elem(map_fd, &key, vals) == 0) {
    __u64 total = 0;
    for (int i = 0; i < nr_cpus; i++)
        total += vals[i];
}
free(vals);
```

- Per-CPU buffers: `nr_cpus * round_up(value_size, 8)` bytes. Forgetting the rounding is a
  common source of corrupted reads for structs with odd sizes.
- Iterate keys: `bpf_map_get_next_key(fd, prev, next)`. Start with `prev = NULL`. The walk is
  not a snapshot; concurrent updates may be seen or missed.
- Pin: `bpf_map__pin(map, "/sys/fs/bpf/name")`, reopen with `bpf_obj_get`. `bpftool map`
  inspects pinned or loaded maps by id or name.
- Freeze: `bpf_map__freeze` (or `bpf_map_freeze`) makes a map read-only from userspace,
  useful for config maps the program reads.

## 10. Decision flow

```
Per-event metrics or counters, read by userspace        -> PERCPU_ARRAY (fixed key) or PERCPU_HASH
Keyed state shared across CPUs, may need compound update -> HASH (with bpf_spin_lock if needed)
Keyed cache where losing old entries is fine             -> LRU_HASH
Integer-indexed fixed table                              -> ARRAY
State per task / socket / inode / cgroup                 -> TASK / SK / INODE / CGRP_STORAGE
Events streamed to userspace                             -> RINGBUF (5.8+), else PERF_EVENT_ARRAY
Chaining programs                                        -> PROG_ARRAY (tail calls)
Packet redirect in XDP or TC                             -> DEVMAP, CPUMAP, XSKMAP
Socket redirect or reuseport selection                   -> SOCKMAP, SOCKHASH, REUSEPORT_SOCKARRAY
Longest-prefix match on addresses                        -> LPM_TRIE
FIFO or LIFO queue                                       -> QUEUE or STACK
Cheap approximate membership                             -> BLOOM_FILTER (5.16+)
Stack traces for profiling                               -> STACK_TRACE + counter map keyed by stack id
```
