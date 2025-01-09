'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { uploadToTelegram } from '@/lib/telegram'
import { AlertCircle, Camera, CameraOff, SwitchCamera } from 'lucide-react'

export default function VideoRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [hasPermission, setHasPermission] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const MIN_RECORDING_TIME = 5 // Minimum recording time in seconds

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')

  const getAvailableDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true }) // Request initial permission
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(device => device.kind === 'videoinput')
      setDevices(videoDevices)
      
      // On mobile, we'll use facingMode instead of deviceId
      if (videoDevices.length > 0 && !selectedDeviceId) {
        const backCamera = videoDevices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear')
        )
        if (backCamera) {
          setSelectedDeviceId(backCamera.deviceId)
          setFacingMode('environment')
        } else {
          setSelectedDeviceId(videoDevices[0].deviceId)
          setFacingMode('user')
        }
      }
    } catch (error) {
      console.error('Error getting devices:', error)
      setPermissionError('Failed to get available cameras. Please check your permissions.')
    }
  }, [])

  const setupMediaStream = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      // For mobile devices, use facingMode
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
      }

      // If we're already recording, create a new MediaRecorder
      if (isRecording && mediaRecorderRef.current) {
        const options = { mimeType: 'video/webm;codecs=vp8,opus' }
        const newMediaRecorder = new MediaRecorder(stream, options)
        
        newMediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        newMediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' })
          setRecordedBlob(blob)
          stream.getTracks().forEach(track => track.stop())
        }

        mediaRecorderRef.current = newMediaRecorder
        newMediaRecorder.start(1000)
      }

      return stream
    } catch (error) {
      console.error('Error setting up media stream:', error)
      throw error
    }
  }

  const startRecording = useCallback(async () => {
    try {
      await setupMediaStream()
      
      const options = { mimeType: 'video/webm;codecs=vp8,opus' }
      const mediaRecorder = new MediaRecorder(streamRef.current!, options)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        setRecordedBlob(blob)
        streamRef.current?.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      setPermissionError(null)

      timerRef.current = setInterval(() => {
        setRecordingTime((prevTime) => prevTime + 1)
      }, 1000)
    } catch (error) {
      console.error('Error starting recording:', error)
      setPermissionError('Failed to start recording. Please check your camera and microphone permissions.')
    }
  }, [])

  const switchCamera = useCallback(async () => {
    try {
      setIsSwitchingCamera(true)
      // Toggle facing mode
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
      setFacingMode(newFacingMode)
      
      await setupMediaStream()
    } catch (error) {
      console.error('Error switching camera:', error)
      setPermissionError('Failed to switch camera. Please try again.')
    } finally {
      setIsSwitchingCamera(false)
    }
  }, [facingMode])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    setIsRecording(false)
  }, [])

  const handleUpload = async () => {
    if (recordedBlob) {
      setIsUploading(true)
      setUploadProgress(0)
      try {
        const fileId = await uploadToTelegram(recordedBlob, `video_${Date.now()}.webm`, undefined, (progress: number) => {
          setUploadProgress(progress)
        });
        console.log('Video uploaded to Telegram, file ID:', fileId);
        setRecordedBlob(null);
        setRecordingTime(0);
      } catch (error) {
        console.error('Error uploading to Telegram:', error);
        alert('Failed to upload video. Please try again.');
      }
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  useEffect(() => {
    getAvailableDevices()
    navigator.mediaDevices.addEventListener('devicechange', getAvailableDevices)
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      navigator.mediaDevices.removeEventListener('devicechange', getAvailableDevices)
    }
  }, [getAvailableDevices])

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
        </div>

        <div className="bg-black/80 text-white p-4 space-y-4">
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="lg"
              onClick={switchCamera}
              disabled={isSwitchingCamera || devices.length < 2}
              className="w-14 h-14 rounded-full"
            >
              <SwitchCamera className="h-6 w-6" />
            </Button>

            {!isRecording && !recordedBlob && (
              <Button
                size="lg"
                onClick={startRecording}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600"
              >
                <Camera className="h-6 w-6" />
              </Button>
            )}

            {isRecording && (
              <Button
                variant="destructive"
                size="lg"
                onClick={stopRecording}
                disabled={recordingTime < MIN_RECORDING_TIME}
                className="w-14 h-14 rounded-full"
              >
                <CameraOff className="h-6 w-6" />
              </Button>
            )}

            {recordedBlob && (
              <Button
                size="lg"
                onClick={handleUpload}
                disabled={isUploading}
                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600"
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
            )}

            <div className="w-14" /> {/* Spacer for layout balance */}
          </div>

          {isRecording && (
            <div className="flex justify-center">
              <span className="text-xl font-mono">
                {formatTime(recordingTime)}
              </span>
            </div>
          )}

          {isUploading && (
            <Progress value={uploadProgress} className="w-full" />
          )}

          {permissionError && (
            <div className="bg-red-500/20 text-red-100 p-3 rounded-lg flex items-center">
              <AlertCircle className="mr-2 h-5 w-5" />
              {permissionError}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

