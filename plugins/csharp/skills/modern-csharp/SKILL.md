---
name: modern-csharp
description: >
  Write, review or refactor C# on modern .NET (.NET 6+ / C# 10+): records, init-only
  properties, pattern matching and switch expressions, nullable reference types,
  value objects as readonly record structs, async/await with cancellation,
  Span<T>/Memory<T>, and public API design. Use when writing new C# code, designing a
  library or service API, or optimizing a performance-critical path on modern .NET.
  Do NOT use on .NET Framework 4.8 or LangVersion 7.3 projects: none of these features
  compile there.
user-invocable: false
---

# Modern C# Coding Standards

## Reference Files

- [value-objects-and-patterns.md](./references/value-objects-and-patterns.md): Full value object examples and pattern matching code
- [performance-and-api-design.md](./references/performance-and-api-design.md): Span<T>/Memory<T> examples and API design principles
- [composition-and-error-handling.md](./references/composition-and-error-handling.md): Composition over inheritance, Result type, testing patterns
- [anti-patterns.md](./references/anti-patterns.md): Reflection avoidance and common anti-patterns

## Core Principles

1. **Immutability by Default** - Use `record` types and `init`-only properties
2. **Type Safety** - Leverage nullable reference types and value objects
3. **Modern Pattern Matching** - Use `switch` expressions and patterns extensively
4. **Async Everywhere** - Prefer async APIs with proper cancellation support
5. **Zero-Allocation Patterns** - Use `Span<T>` and `Memory<T>` for performance-critical code
6. **API Design** - Accept abstractions, return appropriately specific types
7. **Composition Over Inheritance** - Avoid abstract base classes, prefer composition
8. **Value Objects as Structs** - Use `readonly record struct` for value objects

---

## Language Patterns

### Records for Immutable Data (C# 9+)

Use `record` types for DTOs, messages, events, and domain entities.

```csharp
// Simple immutable DTO
public record CustomerDto(string Id, string Name, string Email);

// Record with validation in constructor
public record EmailAddress
{
    public string Value { get; init; }

    public EmailAddress(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains('@'))
            throw new ArgumentException("Invalid email address", nameof(value));

        Value = value;
    }
}

// Records with collections - use IReadOnlyList
public record ShoppingCart(
    string CartId,
    string CustomerId,
    IReadOnlyList<CartItem> Items
)
{
    public decimal Total => Items.Sum(item => item.Price * item.Quantity);
}
```

**When to use `record class` vs `record struct`:**
- `record class` (default): Reference types, use for entities, aggregates, DTOs with multiple properties
- `record struct`: Value types, use for value objects (see next section)

### Value Objects as readonly record struct

Value objects should **always be `readonly record struct`** for performance and value semantics, e.g. `public readonly record struct Money(decimal Amount, string Currency);`. Use explicit conversions, never implicit operators.

See [value-objects-and-patterns.md](./references/value-objects-and-patterns.md) for complete examples including multi-value objects, factory patterns, and the no-implicit-conversion rule.

### Pattern Matching (C# 8-12)

Use switch expressions, property patterns, relational patterns, and list patterns for cleaner code. See [value-objects-and-patterns.md](./references/value-objects-and-patterns.md) for full examples.

---

### Nullable Reference Types (C# 8+)

Enable nullable reference types in your project and handle nulls explicitly.

```csharp
// In .csproj
<PropertyGroup>
    <Nullable>enable</Nullable>
</PropertyGroup>

// Explicit nullability
public string? FindUserName(string userId)
{
    var user = _repository.Find(userId);
    return user?.Name;
}

// Pattern matching with null checks
public decimal GetDiscount(Customer? customer) => customer switch
{
    null => 0m,
    { IsVip: true } => 0.20m,
    { OrderCount: > 10 } => 0.10m,
    _ => 0.05m
};

// Guard clauses with ArgumentNullException.ThrowIfNull (C# 11+)
public void ProcessOrder(Order? order)
{
    ArgumentNullException.ThrowIfNull(order);
    // order is now non-nullable in this scope
    Console.WriteLine(order.Id);
}
```

---

## Composition Over Inheritance

**Avoid abstract base classes.** Use interfaces + composition. Use static helpers for shared logic. Use records with factory methods for variants.

See [composition-and-error-handling.md](./references/composition-and-error-handling.md) for full examples.

---

## Performance Patterns

### Async/Await Best Practices

```csharp
// Async all the way - always accept CancellationToken
public async Task<Order> GetOrderAsync(string orderId, CancellationToken cancellationToken)
{
    var order = await _repository.GetAsync(orderId, cancellationToken);
    return order;
}

// ValueTask for frequently-called, often-synchronous methods
public ValueTask<Order?> GetCachedOrderAsync(string orderId, CancellationToken cancellationToken)
{
    if (_cache.TryGetValue(orderId, out var order))
        return ValueTask.FromResult<Order?>(order);
    return GetFromDatabaseAsync(orderId, cancellationToken);
}

// IAsyncEnumerable for streaming
public async IAsyncEnumerable<Order> StreamOrdersAsync(
    string customerId,
    [EnumeratorCancellation] CancellationToken cancellationToken = default)
{
    await foreach (var order in _repository.StreamAllAsync(cancellationToken))
    {
        if (order.CustomerId == customerId)
            yield return order;
    }
}
```

**Key rules:**
- Always accept `CancellationToken` with `= default`
- Use `ConfigureAwait(false)` in library code
- Never block on async code (no `.Result` or `.Wait()`)
- Use linked CancellationTokenSource for timeouts

### Span<T> and Memory<T>

Use `Span<T>` for synchronous zero-allocation operations, `Memory<T>` for async, and `ArrayPool<T>` for large temporary buffers.

See [performance-and-api-design.md](./references/performance-and-api-design.md) for complete Span/Memory examples and the API design section.

---

## Error Handling: Result Type

For expected errors, use `Result<T, TError>` instead of exceptions. Use exceptions only for unexpected/system errors.

See [composition-and-error-handling.md](./references/composition-and-error-handling.md) for the full Result type implementation and usage examples.

---

## Avoid Reflection-Based Metaprogramming

**Banned:** AutoMapper, Mapster, ExpressMapper. Use explicit mapping extension methods instead. Use `UnsafeAccessorAttribute` (.NET 8+) when you genuinely need private member access.

See [anti-patterns.md](./references/anti-patterns.md) for full guidance.

---

## Best Practices Summary

### DO's
- Use `record` for DTOs, messages, and domain entities
- Use `readonly record struct` for value objects
- Leverage pattern matching with `switch` expressions
- Enable and respect nullable reference types
- Use async/await for all I/O operations
- Accept `CancellationToken` in all async methods
- Use `Span<T>` and `Memory<T>` for high-performance scenarios
- Accept abstractions (`IEnumerable<T>`, `IReadOnlyList<T>`)
- Use `Result<T, TError>` for expected errors
- Pool buffers with `ArrayPool<T>` for large allocations
- Prefer composition over inheritance

### DON'Ts
- Don't use mutable classes when records work
- Don't use classes for value objects (use `readonly record struct`)
- Don't create deep inheritance hierarchies
- Don't ignore nullable reference type warnings
- Don't block on async code (`.Result`, `.Wait()`)
- Don't use `byte[]` when `Span<byte>` suffices
- Don't forget `CancellationToken` parameters
- Don't return mutable collections from APIs
- Don't throw exceptions for expected business errors
- Don't allocate large arrays repeatedly (use `ArrayPool`)

See [anti-patterns.md](./references/anti-patterns.md) for detailed anti-pattern examples.

---
