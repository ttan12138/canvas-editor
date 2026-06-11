export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          ie: '11',
          chrome: '52',
          ios: '9',
          android: '4.1'
        },
        corejs: 3,
        useBuiltIns: 'usage',
        modules: false
      }
    ]
  ],
  plugins: [
    [
      '@babel/plugin-transform-runtime',
      {
        corejs: false,
        helpers: true,
        regenerator: true
      }
    ]
  ]
}
