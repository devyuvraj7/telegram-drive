'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { uploadToTelegram } from '@/lib/telegram'
import { AlertCircle, ArrowLeft, Camera, CameraOff, Moon, Play, Pause, RotateCcw, Settings, Sun, SwitchCamera, Upload } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

export default function VideoRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlobs, setRecordedBlobs] = useState<Blob[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [videoQuality, setVideoQuality] = useState<'high' | 'medium' | 'low'>('medium')
  const [showUploadButton, setShowUploadButton] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const { toast } = useToast()

  const MIN_RECORDING_TIME = 3
  const SUPPORTED_MIME_TYPES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/mp4;codecs=h264,aac',
  ]

  const getPreferredMimeType = () => {
    return SUPPORTED_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) || ''
  }

  const getVideoConstraints = useCallback(() => {
    const constraints: MediaTrackConstraints = {
      facingMode: facingMode,
    }

    switch (videoQuality) {
      case 'high':
        constraints.width = { ideal: 1920 }
        constraints.height = { ideal: 1080 }
        break
      case 'medium':
        constraints.width = { ideal: 1280 }
        constraints.height = { ideal: 720 }
        break
      case 'low':
        constraints.width = { ideal: 640 }
        constraints.height = { ideal: 480 }
        break
    }

    return constraints
  }, [facingMode, videoQuality])

  const setupMediaStream = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      const constraints: MediaStreamConstraints = {
        video: getVideoConstraints(),
        audio: true
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      if (isRecording) {
        await setupMediaRecorder(stream)
      }

      return stream
    } catch (error) {
      console.error('Error setting up media stream:', error)
      setPermissionError('Failed to setup camera. Please check permissions and try again.')
      toast({
        title: "Camera Error",
        description: "Failed to setup camera. Please check permissions and try again.",
        variant: "destructive",
      })
      throw error
    }
  }

  const setupMediaRecorder = async (stream: MediaStream) => {
    const mimeType = getPreferredMimeType()
    if (!mimeType) {
      throw new Error('No supported video format found')
    }

    const newMediaRecorder = new MediaRecorder(stream, { 
      mimeType,
      videoBitsPerSecond: videoQuality === 'high' ? 2500000 : videoQuality === 'medium' ? 1000000 : 500000
    })
    
    newMediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }

    newMediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event)
      stopRecording()
      setPermissionError('Recording error occurred. Please try again.')
      toast({
        title: "Recording Error",
        description: "An error occurred during recording. Please try again.",
        variant: "destructive",
      })
    }

    newMediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      setRecordedBlobs(prevBlobs => [...prevBlobs, blob])
      chunksRef.current = []
    }

    mediaRecorderRef.current = newMediaRecorder
    newMediaRecorder.start(1000) // Capture in 1-second chunks
  }

  const startRecording = useCallback(async () => {
    try {
      setShowUploadButton(false)
      setRecordedBlobs([])
      chunksRef.current = []
      setRecordingTime(0)
      
      await setupMediaStream()
      
      setIsRecording(true)
      setIsPaused(false)
      setPermissionError(null)

      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      setPermissionError('Failed to start recording. Please check your camera and microphone permissions.')
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check your camera and microphone permissions.",
        variant: "destructive",
      })
    }
  }, [])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)
      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1)
      }, 1000)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    setIsRecording(false)
    setIsPaused(false)
    setShowUploadButton(true)
  }, [])

  const switchCamera = useCallback(async () => {
    try {
      setIsSwitchingCamera(true)
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
      setFacingMode(newFacingMode)
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }

      await setupMediaStream()

      if (isRecording) {
        await setupMediaRecorder(streamRef.current!)
      }
    } catch (error) {
      console.error('Error switching camera:', error)
      setPermissionError('Failed to switch camera. Please try again.')
      toast({
        title: "Camera Switch Error",
        description: "Failed to switch camera. Please try again.",
        variant: "destructive",
      })
      setFacingMode(facingMode)
      await setupMediaStream().catch(console.error)
    } finally {
      setIsSwitchingCamera(false)
    }
  }, [facingMode, isRecording])

  const handleUpload = async () => {
    if (recordedBlobs.length === 0 || isRecording) return

    setIsUploading(true)
    setUploadProgress(0)
    try {
      const finalBlob = new Blob(recordedBlobs, { type: getPreferredMimeType() })
      const fileId = await uploadToTelegram(
        finalBlob,
        `video_${Date.now()}.${finalBlob.type.includes('mp4') ? 'mp4' : 'webm'}`,
        undefined,
        (progress: number) => {
          setUploadProgress(progress)
        }
      )
      console.log('Video uploaded to Telegram, file ID:', fileId)
      toast({
        title: "Upload Successful",
        description: "Your video has been uploaded successfully.",
        variant: "default",
      })
      setRecordedBlobs([])
      setRecordingTime(0)
      setShowUploadButton(false)
    } catch (error) {
      console.error('Error uploading to Telegram:', error)
      setPermissionError('Failed to upload video. Please try again.')
      toast({
        title: "Upload Error",
        description: "Failed to upload video. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle('dark')
  }

  const previewRecording = () => {
    if (recordedBlobs.length === 0) return

    const finalBlob = new Blob(recordedBlobs, { type: getPreferredMimeType() })
    const videoURL = URL.createObjectURL(finalBlob)

    if (previewVideoRef.current) {
      previewVideoRef.current.src = videoURL
      previewVideoRef.current.play().catch(console.error)
    }

    setIsPreviewMode(true)
  }

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        await setupMediaStream()
      } catch (error) {
        console.error('Error initializing camera:', error)
      }
    }

    initializeCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  return (
    <div className={`fixed inset-0 ${isDarkMode ? 'dark' : ''}`}>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
      >
        <div className="flex-1 relative">
          {!isPreviewMode ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <video
              ref={previewVideoRef}
              controls
              playsInline
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          )}
          
          {/* Quality selector */}
          <div className="absolute top-4 right-4 z-10">
            <Select value={videoQuality} onValueChange={(value: 'high' | 'medium' | 'low') => setVideoQuality(value)}>
              <SelectTrigger className="w-[100px] bg-white/50 dark:bg-black/50 text-gray-900 dark:text-white border-0">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recording indicator */}
          {isRecording && (
            <div className="absolute top-4 left-4 flex items-center space-x-2 z-10">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-medium">
                {formatTime(recordingTime)}
              </span>
            </div>
          )}
        </div>

        <div className="bg-white/80 dark:bg-black/80 text-gray-900 dark:text-white p-4 space-y-4">
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.history.back()}
              className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>

            <div className="flex space-x-4">
              {!isRecording && !showUploadButton && (
                <Button
                  size="icon"
                  onClick={startRecording}
                  disabled={isUploading}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white"
                >
                  <Camera className="h-8 w-8" />
                </Button>
              )}

              {isRecording && (
                <>
                  {!isPaused ? (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={pauseRecording}
                      className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      <Pause className="h-8 w-8" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={resumeRecording}
                      className="w-16 h-16 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      <Play className="h-8 w-8" />
                    </Button>
                  )}

                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={stopRecording}
                    disabled={recordingTime < MIN_RECORDING_TIME}
                    className="w-16 h-16 rounded-full"
                  >
                    <CameraOff className="h-8 w-8" />
                  </Button>
                </>
              )}

              {showUploadButton && !isRecording && (
                <>
                  <Button
                    size="icon"
                    onClick={previewRecording}
                    className="w-16 h-16 rounded-full bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <Play className="h-8 w-8" />
                  </Button>
                  <Button
                    size="icon"
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white"
                  >
                    <Upload className="h-8 w-8" />
                  </Button>
                </>
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={isPreviewMode ? () => setIsPreviewMode(false) : switchCamera}
              disabled={isSwitchingCamera || isUploading || isRecording}
              className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {isPreviewMode ? <RotateCcw className="h-6 w-6" /> : <SwitchCamera className="h-6 w-6" />}
            </Button>
          </div>

          {isUploading && (
            <Progress value={uploadProgress} className="w-full" />
          )}

          {permissionError && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-red-500/20 text-red-100 dark:bg-red-900/20 dark:text-red-300 p-3 rounded-lg flex items-center"
            >
              <AlertCircle className="mr-2 h-5 w-5" />
              {permissionError}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

