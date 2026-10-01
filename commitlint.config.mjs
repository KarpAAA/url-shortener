// Conventional Commits narrowed to the project's types; no AI attribution trailers.
const AI_TRAILER = /^(co-authored-by:.*(claude|anthropic|copilot|gpt|cursor)|claude-session:)/im;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-ai-trailer': ({ raw }) => [
          !AI_TRAILER.test(raw),
          'commit message must not carry AI attribution trailers',
        ],
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'chore', 'docs', 'perf', 'build', 'ci'],
    ],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'no-ai-trailer': [2, 'always'],
  },
};
