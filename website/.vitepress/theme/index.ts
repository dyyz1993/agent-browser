import DefaultTheme from 'vitepress/theme'
import DemoPlayground from '../components/DemoPlayground.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DemoPlayground', DemoPlayground)
  }
}
