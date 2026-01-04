# Contributing to betterprompt

Thank you for your interest in contributing to betterprompt!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/nim-ai/betterprompt.git
cd betterprompt

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run benchmarks
npm run bench
```

## Development Commands

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `npm run build`         | Build the library (ESM, CJS, types) |
| `npm run dev`           | Build in watch mode                 |
| `npm test`              | Run tests                           |
| `npm run test:watch`    | Run tests in watch mode             |
| `npm run test:coverage` | Run tests with coverage             |
| `npm run lint`          | Lint source and test files          |
| `npm run lint:fix`      | Fix lint issues                     |
| `npm run typecheck`     | Run TypeScript type checking        |
| `npm run bench`         | Run performance benchmarks          |
| `npm run demo:dev`      | Start demo dev server               |

## Project Structure

```
betterprompt/
├── src/
│   ├── index.ts          # Public API exports
│   ├── cli.ts            # CLI implementation
│   ├── browser.ts        # Browser-specific entry
│   ├── segmentation/     # Text decomposition
│   ├── alignment/        # Semantic alignment
│   ├── diff/             # Edit extraction
│   ├── merge/            # Three-way merge
│   ├── patch/            # Patch generation/application
│   ├── embeddings/       # Embedding providers
│   ├── utils/            # Utility functions
│   └── types/            # TypeScript interfaces
├── tests/                # Test files
├── benchmarks/           # Performance benchmarks
├── demo/                 # Interactive demo
└── docs/                 # Documentation
```

## Making Changes

1. **Create a branch** for your changes
2. **Write tests** for new functionality
3. **Run the test suite** to ensure nothing is broken
4. **Run linting** and fix any issues
5. **Submit a pull request** with a clear description

## Code Style

- TypeScript with strict mode
- ESM-first (use `.js` extensions in imports)
- Use Prettier for formatting (run `npm run format`)
- Follow existing patterns in the codebase

## Testing

Tests use [Vitest](https://vitest.dev/). The test suite includes:

- **Unit tests** (`tests/*.test.ts`) - Core functionality
- **Real-world tests** (`tests/real-world.test.ts`) - Realistic scenarios

Tests use a deterministic embedding provider (character frequency) instead of the ML model for speed and reproducibility.

## Performance

The library targets <100ms for typical prompt merges. Run `npm run bench` to verify performance. If your changes affect performance, include benchmark results in your PR.

## Architecture

### Core Algorithm

1. **Segment** - Break text into semantic units (sentences)
2. **Embed** - Generate vector embeddings for similarity
3. **Align** - Match units between versions
4. **Diff** - Extract edit operations
5. **Merge** - Apply three-way merge logic
6. **Reconstruct** - Rebuild final text

### Key Design Decisions

- **No LLM required** - Uses sentence embeddings, not generative AI
- **Deterministic** - Same inputs always produce same outputs
- **Extensible** - Interfaces for custom embeddings and resolvers
- **Language-agnostic** - Works with any natural language

## Reporting Issues

When reporting bugs, please include:

- Version of betterprompt
- Node.js version
- Minimal reproduction case
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
