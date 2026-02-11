const path = require('path');

module.exports = {
  entry: './dist/index.js', // Use the compiled TypeScript output
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'runtime.umd.js',
    library: 'MJReactRuntime',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  mode: 'production',
  target: 'web',
  resolve: {
    extensions: ['.js', '.json'],
    fallback: {
      // Browser polyfills for Node.js modules
      "path": require.resolve("path-browserify"),
      "fs": false,
      "crypto": false,
      "stream": false,
      "util": false,
      "buffer": false,
      "process": false
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules\/(?!@memberjunction)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['last 2 versions', 'ie >= 11']
                }
              }]
            ]
          }
        },
        // Disable ESM's strict extension requirement for local imports
        resolve: {
          fullySpecified: false
        }
      }
    ]
  },
  externals: {
    // These are expected to be available in the browser environment
    'react': {
      commonjs: 'react',
      commonjs2: 'react',
      amd: 'react',
      root: 'React'
    },
    'react-dom': {
      commonjs: 'react-dom',
      commonjs2: 'react-dom',
      amd: 'react-dom',
      root: 'ReactDOM'
    },
    '@babel/standalone': {
      commonjs: '@babel/standalone',
      commonjs2: '@babel/standalone',
      amd: '@babel/standalone',
      root: 'Babel'
    }
  },
  optimization: {
    minimize: true
  },
  performance: {
    hints: false,
    maxAssetSize: 500000, // 500kb
    maxEntrypointSize: 500000
  }
};