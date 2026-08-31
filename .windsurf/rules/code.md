---
trigger: manual
---

# General Rules

- **Atomic components**
  - Keep components small and focused.
  - Prefer composing multiple small components over one large component.

- **JSDoc**
  - Add _simple_ JSDoc for functions that **compute something** (pure/utility functions).
  - Do **not** add JSDoc to React components unless it’s genuinely needed.

- **Prefer reuse**
  - Always try to use existing types/functions.
  - Don’t create new types/functions unless it’s clearly necessary.

# JSX Conditional Rendering

## DON'T

```jsx
{
  runError ? (
    <Alert severity="error" sx={{ mb: 2 }}>
      {runError}
    </Alert>
  ) : null;
}
```

## DO

```jsx
{
  runError && (
    <Alert severity="error" sx={{ mb: 2 }}>
      {runError}
    </Alert>
  );
}
```

# Efficiency / Storage

- Don’t be lazy about efficiency.
- When writing JSON to disk, **save storage**.

## DON'T

```tsx
await fs.writeJSON(FILES.agentState, state, { spaces: 2 });
```

## DO

```tsx
await fs.writeJSON(FILES.agentState, state);
```

# Naming for Stored Data (Prefer Abbreviations)

When designing types/objects that are persisted to disk, prefer short field names.

- **Time**
  - Prefer `t` instead of `time` / `timeMs`
- **Percent**
  - Prefer `pct` instead of `percent`
