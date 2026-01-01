/** @type { import('@storybook/nextjs').StorybookConfig } */
module.exports = {
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {}
    }
  },
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: ['@storybook/addon-essentials'],
};
