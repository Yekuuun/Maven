---
name: c-memory-safety-review
description: Use when writing or reviewing C code for memory safety, undefined behavior, or resource handling. Covers bounds, lifetimes, allocation checks, integer overflow, error paths, input handling and the sanitizer and debugging workflow.
---

# C memory-safety review

## Checklist

- **Bounds**: every array index and every `memcpy` / `strncpy` length is checked against the
  destination size. Prefer `snprintf` over `sprintf`.
- **Lifetimes**: no use after `free`, no returning pointers to locals, no double free.
  Ownership is stated in the function's comment or name.
- **Allocation**: every `malloc` / `calloc` / `realloc` result is checked. Never assign
  `realloc`'s result back to the only pointer you still need on failure.
- **Integers**: check `count * size` for overflow before allocating. Review signed/unsigned
  comparisons and implicit conversions.
- **Undefined behavior**: signed overflow, shifts by the width or more, strict aliasing,
  uninitialized reads, out-of-range enum values.
- **Error paths**: every early return or `goto cleanup` releases what was acquired.
- **Concurrency**: shared state is guarded by a lock or atomics. `volatile` is not a
  synchronization primitive.
- **Input**: data from the network, files or argv is hostile until its length and format
  are checked.

## Verification workflow

1. Build with `-Wall -Wextra -Werror -Wconversion`.
2. Run under sanitizers: `-fsanitize=address,undefined -g`.
3. For leaks and invalid reads outside sanitizer coverage: `valgrind --leak-check=full ./prog`.
4. For a crash: `gdb -ex run -ex bt --args ./prog <args>`.

## Output

Report each finding as `file:line`, its class (overflow, use-after-free, leak, bounds,
undefined behavior, other), the explanation, and the fix. Mark each as **confirmed**
(reproduced, or proven from the code) or **suspected**.
