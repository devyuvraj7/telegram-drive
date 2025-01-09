'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { uploadToTelegram } from '@/lib/telegram'
import { AlertCircle, Camera, CameraOff, Settings, SwitchCamera, Upload } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function VideoRecorder() {
  // Core states
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [videoQuality, setVideoQuality] = useState<'high' | 'medium' | 'low'>('high')
  const [showUploadButton, setShowUploadButton] = useState(false)

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Constants
  const MIN_RECORDING_TIME = 3
  const SUPPORTED_MIME_TYPES = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
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
      // Stop existing stream if any
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
        await videoRef.current.play().catch(console.error)
      }

      // If we're recording, setup new MediaRecorder
      if (isRecording) {
        const mimeType = getPreferredMimeType()
        if (!mimeType) {
          throw new Error('No supported video format found')
        }

        const newMediaRecorder = new MediaRecorder(stream, { mimeType })
        
        newMediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        newMediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event)
          stopRecording()
          setPermissionError('Recording error occurred. Please try again.')
        }

        mediaRecorderRef.current = newMediaRecorder
        newMediaRecorder.start(1000)
      }

      return stream
    } catch (error) {
      console.error('Error setting up media stream:', error)
      setPermissionError('Failed to setup camera. Please check permissions and try again.')
      throw error
    }
  }

  const startRecording = useCallback(async () => {
    try {
      setShowUploadButton(false)
      chunksRef.current = []
      setRecordingTime(0)
      
      await setupMediaStream()
      
      const mimeType = getPreferredMimeType()
      if (!mimeType) {
        throw new Error('No supported video format found')
      }

      const mediaRecorder = new MediaRecorder(streamRef.current!, { mimeType })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          setRecordedBlob(blob)
          setShowUploadButton(true)
        } catch (error) {
          console.error('Error creating blob:', error)
          setPermissionError('Failed to process recording. Please try again.')
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        stopRecording()
        setPermissionError('Recording error occurred. Please try again.')
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      setIsPaused(false)
      setPermissionError(null)

      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      setPermissionError('Failed to start recording. Please check your camera and microphone permissions.')
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
      
      // Keep recording state during switch
      const wasRecording = isRecording
      if (wasRecording && mediaRecorderRef.current) {
        mediaRecorderRef.current.pause()
      }

      await setupMediaStream()

      if (wasRecording && mediaRecorderRef.current) {
        mediaRecorderRef.current.resume()
      }
    } catch (error) {
      console.error('Error switching camera:', error)
      setPermissionError('Failed to switch camera. Please try again.')
      // Try to recover by switching back
      setFacingMode(facingMode)
      await setupMediaStream().catch(console.error)
    } finally {
      setIsSwitchingCamera(false)
    }
  }, [facingMode, isRecording])

  const handleUpload = async () => {
    if (!recordedBlob || isRecording) return

    setIsUploading(true)
    setUploadProgress(0)
    try {
      const fileId = await uploadToTelegram(
        recordedBlob,
        `video_${Date.now()}.${recordedBlob.type.includes('mp4') ? 'mp4' : 'webm'}`,
        undefined,
        (progress: number) => {
          setUploadProgress(progress)
        }
      )
      console.log('Video uploaded to Telegram, file ID:', fileId)
      setRecordedBlob(null)
      setRecordingTime(0)
      setShowUploadButton(false)
    } catch (error) {
      console.error('Error uploading to Telegram:', error)
      setPermissionError('Failed to upload video. Please try again.')
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
    <div className="fixed inset-0 bg-black">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full"
      >
        <div className="flex-1 relative">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Quality selector */}
          <div className="absolute top-4 right-4">
            <Select value={videoQuality} onValueChange={(value: 'high' | 'medium' | 'low') => setVideoQuality(value)}>
              <SelectTrigger className="w-[100px] bg-black/50 text-white border-0">
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
            <div className="absolute top-4 left-4 flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-medium">
                {formatTime(recordingTime)}
              </span>
            </div>
          )}
        </div>

        <div className="bg-black/80 text-white p-4 space-y-4">
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="lg"
              onClick={switchCamera}
              disabled={isSwitchingCamera || isUploading}
              className="w-14 h-14 rounded-full"
            >
              <SwitchCamera className="h-6 w-6" />
            </Button>

            <div className="flex space-x-4">
              {!isRecording && !showUploadButton && (
                <Button
                  size="lg"
                  onClick={startRecording}
                  disabled={isUploading}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600"
                >
                  <Camera className="h-6 w-6" />
                </Button>
              )}

              {isRecording && (
                <>
                  {!isPaused ? (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={pauseRecording}
                      className="w-14 h-14 rounded-full"
                    >
                      <span className="h-6 w-6 block bg-white" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={resumeRecording}
                      className="w-14 h-14 rounded-full"
                    >
                      <Camera className="h-6 w-6" />
                    </Button>
                  )}

                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={stopRecording}
                    disabled={recordingTime < MIN_RECORDING_TIME}
                    className="w-14 h-14 rounded-full"
                  >
                    <CameraOff className="h-6 w-6" />
                  </Button>
                </>
              )}

              {showUploadButton && !isRecording && (
                <Button
                  size="lg"
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600"
                >
                  <Upload className="h-6 w-6" />
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              size="lg"
              disabled={isRecording || isUploading}
              className="w-14 h-14 rounded-full"
            >
              <Settings className="h-6 w-6" />
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
              className="bg-red-500/20 text-red-100 p-3 rounded-lg flex items-center"
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

