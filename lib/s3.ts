import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export async function uploadChunk(chunk: Blob) {
  const fileName = `video_${Date.now()}.webm`
  
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: fileName,
      Body: chunk,
      ContentType: 'video/webm',
    })

    await s3Client.send(command)
    console.log(`Chunk uploaded successfully: ${fileName}`)
  } catch (error) {
    console.error('Error uploading chunk to S3:', error)
  }
}

