import { NextResponse } from 'next/server'
import { uploadToTelegram } from '@/lib/telegram'

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('video') as Blob

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  try {
    const fileId = await uploadToTelegram(file)
    return NextResponse.json({ message: 'File uploaded successfully to Telegram', fileId })
  } catch (error) {
    console.error('Error uploading file to Telegram:', error)
    return NextResponse.json({ error: 'File upload to Telegram failed' }, { status: 500 })
  }
}

