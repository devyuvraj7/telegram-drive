'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { uploadToTelegram, createFolder } from '@/lib/telegram'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Camera, Upload, FolderPlus } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Input } from '@/components/ui/input'

interface MediaUploaderProps {
  onFileUploaded: () => void;
  currentFolder?: string;
}

export default function MediaUploader({onFileUploaded, currentFolder }: MediaUploaderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
      mediaRecorderRef.current = mediaRecorder

      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        setRecordedBlob(blob)
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      setError(null)

      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      setError('Failed to start recording. Please check your camera and microphone permissions.')
      toast.error('Failed to start recording. Please check your permissions.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    setIsRecording(false)
  }, [])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true)
    setUploadProgress(0)
    setError(null)

    for (const file of acceptedFiles) {
      try {
        await uploadToTelegram(file, file.name, currentFolder, (progress) => {
          setUploadProgress(progress)
        })
        toast.success(`${file.name} uploaded successfully`)
        onFileUploaded()
      } catch (error) {
        console.error('Error uploading file:', error)
        setError(`Failed to upload ${file.name}. Please try again.`)
        toast.error(`Failed to upload ${file.name}`)
      }
    }

    setIsUploading(false)
    setUploadProgress(0)
  }, [onFileUploaded, currentFolder])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const handleUpload = async () => {
    if (recordedBlob) {
      setIsUploading(true)
      setUploadProgress(0)
      setError(null)
      try {
        await uploadToTelegram(recordedBlob, `video_${Date.now()}.webm`, currentFolder, (progress) => {
          setUploadProgress(progress)
        })
        setRecordedBlob(null)
        setRecordingTime(0)
        toast.success('Video uploaded successfully')
        onFileUploaded()
      } catch (error) {
        console.error('Error uploading video:', error)
        setError('Failed to upload video. Please try again.')
        toast.error('Failed to upload video')
      }
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleCreateFolder = async () => {
    if (newFolderName) {
      try {
        await createFolder(newFolderName, currentFolder)
        toast.success(`Folder "${newFolderName}" created successfully`)
        setNewFolderName('')
        onFileUploaded()
      } catch (error) {
        console.error('Error creating folder:', error)
        toast.error('Failed to create folder')
      }
    }
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return (
    <Tabs defaultValue="upload" className="w-full max-w-md mx-auto">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="upload">Upload Files</TabsTrigger>
        <TabsTrigger value="record">Record Video</TabsTrigger>
        <TabsTrigger value="create-folder">Create Folder</TabsTrigger>
      </TabsList>
      <TabsContent value="upload" className="mt-4">
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
        <Button className="mt-4 w-full" onClick={() => document.querySelector('input')?.click()} disabled={isUploading}>
          <Upload className="mr-2 h-4 w-4" /> Select Files
        </Button>
      </TabsContent>
      <TabsContent value="record" className="mt-4">
        <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden mb-4">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        </div>
        <div className="flex justify-center mb-4">
          {!isRecording && !recordedBlob && (
            <Button onClick={startRecording} disabled={isUploading}>
              <Camera className="mr-2 h-4 w-4" /> Start Recording
            </Button>
          )}
          {isRecording && (
            <Button onClick={stopRecording} variant="destructive">
              Stop Recording ({formatTime(recordingTime)})
            </Button>
          )}
          {recordedBlob && (
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Upload Recording'}
            </Button>
          )}
        </div>
        {isUploading && (
          <div className="mt-4">
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-center mt-2">Uploading: {uploadProgress}%</p>
          </div>
        )}
      </TabsContent>
      <TabsContent value="create-folder" className="mt-4">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="New folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <Button onClick={handleCreateFolder} disabled={!newFolderName}>
            <FolderPlus className="mr-2 h-4 w-4" /> Create
          </Button>
        </div>
      </TabsContent>
      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md flex items-center">
          <AlertCircle className="mr-2 h-4 w-4" />
          {error}
        </div>
      )}
    </Tabs>
  )
}

