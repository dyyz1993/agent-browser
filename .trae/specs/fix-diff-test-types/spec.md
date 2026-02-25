# Fix TypeScript Type Errors in diff.e2e.test.ts

## Why
The test file `diff.e2e.test.ts` has TypeScript errors because `isSuccessResponse` type guard does not properly narrow the `data` type - it remains `unknown` even after the type check.

## What Changes
- Add `DiffActionData` interface to `types.ts` to define the shape of action response data with diff
- Update `isSuccessResponse` usage in test file to use the new type

## Impact
- Affected specs: type definitions
- Affected code: `src/types.ts`, `src/__tests__/e2e/diff.e2e.test.ts`

## ADDED Requirements

### Requirement: DiffActionData Type
The system SHALL provide a `DiffActionData` interface for action responses that include diff information.

#### Scenario: Type checking in tests
- **WHEN** test code accesses `fillResult.data.diff`
- **THEN** TypeScript should recognize the property without errors

## MODIFIED Requirements
None

## REMOVED Requirements
None
