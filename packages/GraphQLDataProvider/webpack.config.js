import path from 'node:path';

const config = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'MemberJunctionGraphQLDataProvider.js',
    path: path.resolve(import.meta.dirname, 'dist-browser'),
    library: 'MemberJunctionGraphQLDataProvider',
    libraryTarget: 'var',
  },
};

export default config;
