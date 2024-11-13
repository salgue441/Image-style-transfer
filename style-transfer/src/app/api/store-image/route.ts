import { NextResponse } from "next/server"
import { writeFile } from "fs/promises"
import { join } from "path"

export async function POST(request: Request) {
  try {
    const fileName = request.headers.get("x-filename")
    if (!fileName) {
      return NextResponse.json(
        { error: "No filename provided" },
        { status: 400 }
      )
    }

    const blob = await request.blob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const filePath = join(process.cwd(), "public", "uploads", fileName)

    await writeFile(filePath, buffer)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error storing image:", error)
    return NextResponse.json(
      { error: "Failed to store image" },
      { status: 500 }
    )
  }
}
