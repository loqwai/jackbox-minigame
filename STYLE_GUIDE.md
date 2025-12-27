# Style Guide

Code as haiku.
Sparse. Simple. Poetic.
Every character earns its place.

---

## The Way

### Arrows Only

```typescript
// Yes
const add = (a: number, b: number) => a + b

// No
function add(a: number, b: number): number {
  return a + b;
}
```

Always arrows. Never `function`.
This is the way.

### Else Dies Here

```typescript
// Yes
const getStatus = (score: number) => {
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  return "F"
}

// No
const getStatus = (score: number) => {
  if (score >= 90) {
    return "A";
  } else if (score >= 80) {
    return "B";
  } else {
    return "F";
  }
}
```

Early returns. No else. No negotiation.

### Semicolons Fall Away

```typescript
// Yes
const name = "world"
const greeting = `hello ${name}`

// No
const name = "world";
const greeting = "hello " + name;
```

ASI handles it. Trust the machine.
Template literals. Always.

### Braces: Only When Needed

```typescript
// Yes
if (!user) return null
if (done) return

// No
if (!user) {
  return null;
}
```

One line. No braces. Breathe.

### Types Infer Themselves

```typescript
// Yes
const users = ["alice", "bob"]
const count = users.length

// No
const users: string[] = ["alice", "bob"]
const count: number = users.length
```

TypeScript knows. Let it.
Annotate only at boundaries.

---

## Error Philosophy

### Fail Fast. Fail Loud.

```typescript
// Yes
if (!config.apiKey) throw new Error("API key required")

// No
const apiKey = config.apiKey ?? "default-key"
```

No fallbacks. No silent failures.
Let it crash. Debug in daylight.

### Try/Catch: System Edges Only

```typescript
// Yes - at the edge
app.get("/api", async (c) => {
  try {
    return c.json(await fetchData())
  } catch (e) {
    return c.json({ error: "Failed" }, 500)
  }
})

// No - buried in logic
const getData = () => {
  try {
    return JSON.parse(input)
  } catch {
    return {}
  }
}
```

Controllers catch. Logic throws.

### Optional Chaining: Earn It

```typescript
// Yes - genuinely optional
const name = user?.profile?.displayName

// No - should always exist
const id = user?.id  // If user is required, let it throw
```

Don't chain defensively.
If it should exist, demand it.

---

## Functional Patterns

### Composition Over Loops

```typescript
// Yes
const doubled = numbers.map(n => n * 2)
const sum = numbers.reduce((a, b) => a + b, 0)
const evens = numbers.filter(n => n % 2 === 0)

// No
let doubled = []
for (let i = 0; i < numbers.length; i++) {
  doubled.push(numbers[i] * 2)
}
```

Map. Filter. Reduce.
Loops are legacy.

### Pure Functions

```typescript
// Yes
const updateUser = (user, changes) => ({ ...user, ...changes })

// No
const updateUser = (user, changes) => {
  user.name = changes.name
  return user
}
```

No mutation. Spread and return.

---

## Code Speaks

### No Comments

Code documents itself.
Names reveal intent.
Comments are apologies.

Exception: When asked. Only when asked.

### Names as Poetry

```typescript
// Yes
const fetchUserProfile = async (id) => { ... }
const isExpired = (token) => Date.now() > token.exp

// No
const getData = async (x) => { ... }
const check = (t) => Date.now() > t.exp
```

Names tell stories.
Abbreviations hide them.

---

## Testing

### AAA Pattern

```typescript
describe("when user exists", () => {
  let result

  beforeEach(() => {
    // Arrange + Act
    const user = createUser({ name: "alice" })
    result = validateUser(user)
  })

  it("returns valid", () => {
    // Assert only
    expect(result.valid).toBe(true)
  })
})
```

Arrange and Act in beforeEach.
Assert in it blocks. Nothing else.

### ADD: Be the Asshole

Write the test that fails.
Write the laziest code to pass.
Refactor only when green.

No shortcuts. No anticipation.
Make future-you earn every feature.

---

## The Rhythm

Three lines. Then space.
Fragments over sentences.
Each thought stands alone.

This is not style.
This is discipline.
This is the way.
