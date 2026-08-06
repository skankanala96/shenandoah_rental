import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

// Document types with a fixed single instance, pinned in the structure below
// and excluded from the generic document-type list.
const SINGLETONS = ['property']

export default defineConfig({
  name: 'default',
  title: 'The Foxhole Cabin',

  projectId: '5ctaxts3',
  dataset: 'production',

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            S.listItem()
              .title('Property Info')
              .child(
                S.document().schemaType('property').documentId('property-singleton')
              ),
            S.divider(),
            ...S.documentTypeListItems().filter(
              (listItem) => !SINGLETONS.includes(listItem.getId() as string)
            ),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
