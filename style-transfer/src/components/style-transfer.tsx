"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Loader2, Upload, RefreshCcw, Download } from "lucide-react"
import { ImageUploadDialog } from "@/components/image-dialog"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { default as NextImage } from "next/image"

interface ProcessRepsonse {
  success: boolean
  originalUrl: string
  processedUrl: string
  error?: string
  details?: string
}

export function StyleTransfer() {
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [stylizedImage, setStylizedImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const processImage = async (formData: FormData): Promise<ProcessRepsonse> => {
    const response = await fetch("/api/process-image", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(
        errorData.details || `HTTP error! status: ${response.status}`
      )
    }

    return response.json()
  }

  const preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => resolve()
      img.onerror = reject
      img.src = src
    })
  }

  const handleImageUpload = async (file: File) => {
    setIsProcessing(true)
    setProgress(0)
    setError(null)

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Image size should be less than 10MB",
      })

      setIsProcessing(false)
      return
    }

    const allowedTypes = ["image/jpeg", "image/png"]
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please upload a JPEG, PNG, or WebP image",
      })
      setIsProcessing(false)
      return
    }

    const formData = new FormData()
    formData.append("image", file)

    let progressInterval: NodeJS.Timeout | null = null
    try {
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return 90
          return prev + Math.random() * 10
        })
      }, 500)

      const data = await processImage(formData)
      await Promise.all([
        preloadImage(data.originalUrl),
        preloadImage(data.processedUrl),
      ])

      setOriginalImage(data.originalUrl)
      setStylizedImage(data.processedUrl)
      setProgress(100)

      toast({
        title: "Success",
        description: "Your image has been successfully stylized",
      })
    } catch (error) {
      console.error(error)

      setError(
        error instanceof Error ? error.message : "Failed to process image"
      )

      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process image",
      })

      console.error("Error processing image", error)
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval)
      }

      setIsProcessing(false)
    }
  }

  const handleDownload = async () => {
    if (!stylizedImage) return

    setIsProcessing(true)

    try {
      const response = await fetch(stylizedImage)
      if (!response.ok) {
        throw new Error("Failed to download image")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")

      a.href = url
      a.download = `monet-style-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()

      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 100)

      toast({
        title: "Success",
        description: "Image downloaded successfully",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to download image",
      })

      console.error("Download error:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReset = () => {
    setOriginalImage(null)
    setStylizedImage(null)
    setProgress(0)
    setError(null)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center mb-8 space-y-4">
        <h1 className="text-4xl font-bold text-center">Monet Style Transfer</h1>
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-center max-w-xl">
            Transform your photos into Monet&apos;s style paintings using AI
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Original Image</CardTitle>
            <CardDescription>Upload your image to transform</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "relative min-h-[300px] flex items-center justify-center",
                "border-2 border-dashed rounded-lg",
                originalImage ? "border-muted" : "border-muted-foreground/25"
              )}
            >
              {originalImage ? (
                <>
                  <div className="relative w-full h-[300px]">
                    <NextImage
                      src={originalImage}
                      alt="Original"
                      fill
                      className="object-contain rounded-lg"
                    />
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={handleReset}
                        >
                          <RefreshCcw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Upload new image</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              ) : (
                <ImageUploadDialog onImageUpload={handleImageUpload}>
                  <Button variant="secondary">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Image
                  </Button>
                </ImageUploadDialog>
              )}
            </div>
          </CardContent>
          {originalImage && (
            <CardFooter className="text-sm text-muted-foreground">
              Click the refresh button to upload a different image
            </CardFooter>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Stylized Result</CardTitle>
            <CardDescription>Your image in Monet&apos;s style</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="min-h-[300px] flex items-center justify-center border-2 border-dashed rounded-lg border-muted-foreground/25">
              {isProcessing ? (
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <Progress value={progress} className="w-[60%]" />
                  <p className="text-sm text-muted-foreground">
                    Processing your image...
                  </p>
                </div>
              ) : stylizedImage ? (
                <>
                  <div className="relative w-full h-[300px]">
                    <NextImage
                      src={stylizedImage}
                      alt="Stylized"
                      fill
                      className="object-contain rounded-lg"
                    />
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={handleDownload}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Download stylized image</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Upload an image to see the result
                </p>
              )}
            </div>
          </CardContent>
          {stylizedImage && (
            <CardFooter className="text-sm text-muted-foreground">
              Click the download button to save your stylized image
            </CardFooter>
          )}
        </Card>
      </div>
    </main>
  )
}
