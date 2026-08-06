import {defineType, defineField, defineArrayMember} from 'sanity'
import {HomeIcon} from '@sanity/icons'

export const property = defineType({
  name: 'property',
  title: 'Property Info',
  type: 'document',
  icon: HomeIcon,
  // Singleton: only one property document should ever exist.
  __experimental_actions: ['update', 'publish'],
  preview: {
    prepare: () => ({title: 'The Foxhole Cabin — Property Info'}),
  },
  fields: [
    defineField({
      name: 'heroDescription',
      title: 'Hero Description',
      type: 'text',
      rows: 3,
      description: 'The short line under the hero title on the homepage.',
    }),
    defineField({
      name: 'airbnbUrl',
      title: 'Airbnb Listing URL',
      type: 'url',
      description: 'Used by every "View on Airbnb" / "Book on Airbnb" link on the site.',
    }),
    defineField({
      name: 'checkIn',
      title: 'Check-in Time',
      type: 'string',
      description: 'e.g. "3:00 PM"',
    }),
    defineField({
      name: 'checkOut',
      title: 'Check-out Time',
      type: 'string',
      description: 'e.g. "11:00 AM"',
    }),
    defineField({
      name: 'amenities',
      title: 'Amenities',
      type: 'array',
      description: 'Shown as chips in the Amenities section.',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'amenity',
          fields: [
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description:
                'A Google Material Symbols icon name, e.g. "sports_esports". Browse names at fonts.google.com/icons.',
            }),
            defineField({name: 'name', title: 'Name', type: 'string'}),
            defineField({
              name: 'highlight',
              title: 'Highlight',
              type: 'boolean',
              description: 'Shows a small accent dot next to standout amenities.',
              initialValue: false,
            }),
          ],
          preview: {select: {title: 'name', subtitle: 'icon'}},
        }),
      ],
    }),
    defineField({
      name: 'nearbyDistances',
      title: 'Nearby Attractions',
      type: 'array',
      description: 'Shown as a list under "What\'s Nearby".',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'nearbyPlace',
          fields: [
            defineField({
              name: 'icon',
              title: 'Icon',
              type: 'string',
              description: 'A Google Material Symbols icon name, e.g. "park".',
            }),
            defineField({
              name: 'text',
              title: 'Label',
              type: 'string',
              description: 'e.g. "Shenandoah River — 5 min drive"',
            }),
          ],
          preview: {select: {title: 'text', subtitle: 'icon'}},
        }),
      ],
    }),
  ],
})
