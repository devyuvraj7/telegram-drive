import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadToTelegram } from '@/lib/telegram'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export default function FileUploader() {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true)
    setUploadProgress(0)

    for (const file of acceptedFiles) {
      try {
        await uploadToTelegram(file, (progress) => {
          setUploadProgress(progress)
        })
      } catch (error) {
        console.error('Error uploading file:', error)
        alert(`Failed to upload ${file.name}. Please try again.`)
      }
    }

    setIsUploading(false)
    setUploadProgress(0)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        {...getRootProps()}
        className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the files here ...</p>
        ) : (
          <p>Drag 'n' drop some files here, or click to select files</p>
        )}
      </div>
      {isUploading && (
        <div className="mt-4">
          <Progress value={uploadProgress} className="w-full" />
          <p className="text-center mt-2">Uploading: {uploadProgress}%</p>
        </div>
      )}
      <Button className="mt-4 w-full" onClick={() => document.querySelector('input')?.click()}>
        Select Files
      </Button>
    </div>
  )
}

