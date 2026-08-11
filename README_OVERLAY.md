# ISE AI Service starter overlay

This ZIP is an overlay for a new Next.js App Router project.

1. Create a base project with `npx create-next-app@latest ise-ai-service`.
2. Select TypeScript, ESLint, Tailwind, `src/`, App Router, and alias `@/*`.
3. Install packages: `npm install openai firebase-admin zod`.
4. Copy `.env.example` and `src` from this overlay into the project.
5. Copy `.env.example` to `.env.local` and fill in the secrets.
6. Add Node 22 to `package.json`: `"engines": { "node": "22.x" }`.
7. Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run dev`.
