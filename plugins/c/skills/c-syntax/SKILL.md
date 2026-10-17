---
name: c-syntax
description: Use when writing, reviewing, or refactoring C code for its syntax and layout: file headers and include guards, naming and prefixes, indentation and braces, banner comments, doc comments, struct and typedef layout, function signatures and return conventions. Applies to user-space Linux C, kernel-style C and BPF C. Use it whenever C code is being written, even if the user only asks for "a function" or "a struct", so the output matches the house style. Not for memory-safety or undefined-behaviour review, which is c-memory-safety-review.
---

# C syntax

This skill sets how C is written in this codebase. Where the author's own code is consistent,
it is the rule. Where it is silent, the Linux kernel coding style is the fallback. Where the
author's own code disagrees with itself, this file names the default and the alternative, so
the choice is explicit.

For bounds, lifetimes, allocation and undefined behaviour, use `c:c-memory-safety-review`.
For eBPF-specific verifier rules, use `ebpf:ebpf-review`.

## Precedence

1. The author's explicit rules in this file.
2. The Linux kernel coding style (`Documentation/process/coding-style.rst`), for anything not
   listed here.
3. The compiler's and standard's defaults.

If a file already follows another style consistently, keep that file's style and do not mix.

## File layout

Every header and source file starts with a doc block, then the include guard, then includes.

```c
/**
 * Utility functions for the ft library.
 *
 * @author Yekuuun
 */

#ifndef FT_LIB_H
#define FT_LIB_H

#include "vmlinux.h"
#include "../includes/bpf_config.h"

...

#endif
```

- Include guards are the upper-case file name with `_H` suffix: `FT_LIB_H`, `BPF_COMMON_H`,
  `BPF_STRUCTS_H`. The `#endif` has no comment.
- Local includes use quotes. System and kernel includes use angle brackets.
- `vmlinux.h` comes first in BPF sources, before any local header.
- Headers hold declarations and `static __always_inline` helpers. Non-inline definitions go in
  `.c` files.

## Section banners

Long files split into sections with a banner. Use this exact shape, with the title in
upper case:

```c
//----------------------------------------------------
// ┌────────────────────────────────────┐
//  STR MATCHING
// └────────────────────────────────────┘
//----------------------------------------------------
```

The box characters are part of the style, so keep them.

## Naming

- Everything is `snake_case`. No camelCase, no Hungarian prefixes.
- Constants and macros are upper case: `MAX_STR_LEN`, `TASK_COMM_LEN`, `CAT_BIN`.
- Public helpers in a library carry a short library prefix: `ft_strlen`, `ft_atoi`,
  `ft_strcmp`. The prefix names the library, not the type.
- Internal helpers carry a double underscore: `__is_target_bin`, `__resolve_exe_basename`.
  This marks them as not for use outside the file.
- Callbacks used with `bpf_loop()` are named `__<name>_step`: `__strstr_step`.
- Context and event structs are named after what they capture:
  `sys_enter_openat_ctx`, `sys_exit_read_ctx`, `fd_key`, `sys_enter_cached_val`. Use the
  `_ctx` suffix for tracepoint argument structs, `_key` for map keys, `_val` for map values.
- Loop counters are `i`, `j` and so on. Declare them in the `for`: `for (__u32 i = 0; ...)`.

## Indentation and spacing

- Indent with 4 spaces. Tabs are not used. (Linux kernel style uses tabs. This codebase does
  not, so 4 spaces wins here.)
- Keep lines around 100 columns. The samples do not show a limit, so 100 is a default, not a
  rule from the author. Break a line rather than scroll.
- Keywords take a space before the parenthesis: `if (x)`, `while (i < max)`, `for (...)`,
  `return (x)`. Write `if(` only by mistake; it appears a few times in the samples and is
  not a style.
- Pointers bind to the name: `char *dst`, `const char *s`, `struct task_struct *tsk`.
- Casts to pointers keep the space: `(void *)`, `(char *)s1`, `(struct strstr_ctx *)data`.
- Ranges read with the constant on the left: `'0' <= c && c <= '9'`.
- Use `== NULL` and `!= NULL` for pointer comparisons, and `!ptr` for guard clauses.
- Compare with an explicit value: `*flag == 1`, `ret < 0`, not `*flag` or `!ret`.

## Braces

- Function bodies open on their own line:

  ```c
  static __always_inline int ft_strcmp(const char *cs, const char *ct, __u32 max)
  {
      ...
  }
  ```

- Control blocks open on the same line, with a space: `) {`.
- A single statement under `if`, `for` or `while` has no braces. Use braces as soon as the
  body is more than one statement, or wraps a line.
- `else` follows the closing brace on the same line: `} else {`.

Note: the samples disagree on function braces. The newer files put them on their own line, and
that is the default here. The older ones put them on the signature line. Pick one per file and
do not mix within a file.

## Comments

- Doc comments use `/** ... */` above functions, structs and files.
- Inline comments use `//`, lower-case, short, and explain why, not what. For example
  `//32 overkill but ok.` or `//raw address value for __user *buf`.
- Comments in English. The samples mix in French; new code is in English.
- Doc comments on a function list each parameter with `@name:` or `@name =>`. Put any
  constraint on the parameter in the same line: `@max => must be known at call`.
- If code is adapted from a reference implementation, link it in the doc comment. Example:
  `https://elixir.bootlin.com/linux/v6.17.3/source/...`. Name the kernel version.
- For a syscall or tracepoint struct, put the command that prints its real layout above it, for
  example `>> cat /sys/kernel/debug/tracing/events/syscalls/sys_enter_execve/format`.
- Explain the verifier or the kernel constraint behind a non-obvious line: why a copy goes
  through `bpf_probe_read_kernel_str`, why an index is masked, why a return value is `-1`.

## Structs and typedefs

- Name structs in full with `struct name { ... };`. Use a `typedef` only when the struct is
  a shared context or event layout, and then use the same name for the typedef:
  `typedef struct sys_enter_read_ctx { ... } sys_enter_read_ctx;`.
- One field per line. Group fields with a blank line: the common tracepoint header first, then
  the syscall-specific fields.
- Use the kernel integer types in BPF code: `__u8`, `__u32`, `__u64`, `__s64`. Plain `int`
  and `unsigned long` appear where the layout must match a tracepoint format.
- Put a trailing `//` comment on a field when its meaning is not obvious from the type.
- Fixed-size string buffers use a named constant: `char path[MAX_PATH];`.

## Functions

- Helpers that are used from a single file are `static`. In BPF code, helpers are
  `static __always_inline`. Callbacks are `static long`.
- The return type sits on the same line as the name: `static int __is_target_process(...)`.
- Return conventions:
  - `0` for success and a negative value for an error, when the function does an operation
    that can fail with a code: `return bpf_core_read_str(...)`, `return -1` for a lookup
    that cannot proceed.
  - `int` `1` or `0` for a yes-or-no question. Write it as a comparison that returns the
    boolean, for example `return *bin_cache_flag == 1;` or `return bpf_map_lookup_elem(...) != NULL;`.
  - `NULL` for a pointer result that failed.
- Guard clauses first. Check the bad case and return, so the happy path stays flat:

  ```c
  if (!tsk)
      return -1;
  ```

- A buffer's size is passed right after its pointer, and named after the buffer with an `s`
  prefix: `(char *dst, size_t sdst)`. A bound on how far to read is named `max`:
  `(const char *s, __u32 max)`.
- A loop with a small constant bound that the verifier must see unrolled gets
  `#pragma unroll`, as in `ft_strlen`.

## Constants

- Constants are `#define` with an upper-case name.

## Checklist

- [ ] File starts with a doc block and an `@author`, has the include guard, and `#endif` has no
      comment.
- [ ] Names are snake_case, with `ft_` for public library helpers and `__` for internal ones.
- [ ] Indent is 4 spaces. `if (` has a space. Pointers bind to the name.
- [ ] Function body opens on its own line. Control block opens on the same line.
- [ ] Doc comments list each parameter and any constraint, and link any borrowed reference.
- [ ] Non-obvious lines explain the kernel or verifier reason.
- [ ] Struct fields are one per line, grouped, with kernel integer types in BPF code.
- [ ] Guard clauses first, returns follow the convention for the function.
