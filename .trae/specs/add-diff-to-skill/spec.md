# Add Diff Feature to Skill Documentation

## Why
The `--diff` feature has been implemented but is not documented in the skill files (`SKILL.md` and `commands.md`). Users need to know about this feature to track page changes after interactions.

## What Changes
- Add `--diff` feature documentation to `SKILL.md`
- Add `--diff` option to `commands.md` reference

## Impact
- Affected specs: documentation
- Affected code: `skills/agent-browser/SKILL.md`, `skills/agent-browser/references/commands.md`

## ADDED Requirements

### Requirement: Diff Feature Documentation
The system SHALL provide documentation for the `--diff` feature in the skill files.

#### Scenario: User reads SKILL.md
- **WHEN** user reads `SKILL.md`
- **THEN** they should see documentation about the `--diff` option

#### Scenario: User reads commands.md
- **WHEN** user reads `commands.md`
- **THEN** they should see the `--diff` option listed for interaction commands

## MODIFIED Requirements
None

## REMOVED Requirements
None
