import {createClient} from '@sanity/client'
import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_TOKEN,
})

// Mirrors the photos currently hardcoded in the #gallery-grid section of index.html.
const photos = [
  {file: 'exterior_v1.avif', caption: 'Cabin Exterior', size: 'large', order: 1},
  {file: 'Living_room_main.avif', caption: 'Living Room', size: 'normal', order: 2},
  {file: 'full_kithcen.avif', caption: 'Full Kitchen', size: 'normal', order: 3},
  {file: 'hotTub.avif', caption: 'Private Hot Tub', size: 'normal', order: 4},
  {file: 'bedroom1.avif', caption: 'Primary Bedroom', size: 'normal', order: 5},
  {file: 'patio_v1.avif', caption: 'Front Patio', size: 'normal', order: 6},
  {file: 'exterior_deck.avif', caption: 'Rear Deck', size: 'normal', order: 7},
  {file: 'deck_day.jpg', caption: 'Deck by Day', size: 'normal', order: 8},
  {file: 'full_bath1.avif', caption: 'Full Bathroom', size: 'normal', order: 9},
  {file: 'exterior_snow.avif', caption: 'Winter at the Cabin', size: 'normal', order: 10},
  {file: 'bedroom2.avif', caption: 'Second Bedroom', size: 'normal', order: 11},
  {file: 'Living_room_view1.avif', caption: 'Living Room View', size: 'normal', order: 12},
  {file: 'nearby_lake.avif', caption: 'Shenandoah River', size: 'normal', order: 13},
  {file: 'deck_night.jpg', caption: 'Evening on the Deck', size: 'normal', order: 14},
]

async function uploadGallery() {
  if (!process.env.SANITY_TOKEN) {
    throw new Error('SANITY_TOKEN missing from .env')
  }

  console.log(`Uploading ${photos.length} photos to Sanity...\n`)

  for (const photo of photos) {
    const filePath = path.join(__dirname, 'photos', photo.file)

    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping ${photo.file} — file not found`)
      continue
    }

    try {
      const asset = await client.assets.upload('image', fs.createReadStream(filePath), {
        filename: photo.file,
      })

      await client.createOrReplace({
        _id: `gallery-${photo.order}`,
        _type: 'galleryPhoto',
        image: {_type: 'image', asset: {_type: 'reference', _ref: asset._id}},
        caption: photo.caption,
        size: photo.size,
        order: photo.order,
      })

      console.log(`  ${photo.file} -> ${photo.caption}`)
    } catch (err) {
      console.error(`  FAILED ${photo.file}: ${err.message}`)
    }
  }

  console.log('\nDone. Refresh Sanity Studio to see the gallery photos.')
}

uploadGallery().catch((err) => {
  console.error('\nUpload failed:', err.message)
  process.exit(1)
})
