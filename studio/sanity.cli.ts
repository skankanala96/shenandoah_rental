import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '5ctaxts3',
    dataset: 'production',
  },
  deployment: {
    appId: 'wpjrvqxdgl0l6r77psa0t9ic',
    autoUpdates: true,
  },
})
