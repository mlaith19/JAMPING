"use client"

import { useState, useCallback } from "react"
import { Arena3D, type ObstacleData } from "./arena-3d"
import { Button } from "@/components/ui/button"
import { 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Maximize2, 
  Plus, 
  Trash2, 
  Move, 
  RotateCw,
  ChevronUp,
  Flag,
  ChevronDown,
  Save,
  Edit3,
  MousePointer,
  Layers
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

const obstacleTypes = [
  { value: "rails", label: "מוטות", color: "#dc2626" },
  { value: "oxer", label: "אוקסר", color: "#3b82f6" },
  { value: "wall", label: "קיר", color: "#a0522d" },
  { value: "water", label: "מים", color: "#0ea5e9" },
  { value: "gate", label: "שער", color: "#059669" },
  { value: "triple-bar", label: "משולש", color: "#7c3aed" },
  { value: "plank", label: "קרשים", color: "#ea580c" },
] as const

// FEI Course Generator - generates random courses following FEI rules
function generateFEICourse(
  numObstacles: number, 
  allowedTypes: ObstacleData["type"][] = ["rails", "oxer", "wall", "water", "gate", "triple-bar", "plank"]
): { obstacles: ObstacleData[], start: [number, number, number], finish: [number, number, number] } {
  const types = allowedTypes.length > 0 ? allowedTypes : ["rails", "oxer", "wall", "gate", "triple-bar", "plank"]
  
  // Arena bounds
  const arenaWidth = 50 // -25 to 25
  const arenaHeight = 30 // -15 to 15
  const margin = 5
  const minDistance = 8 // FEI minimum distance between obstacles
  
  // Generate course shape - random selection
  const courseShapes = ["figure8", "serpentine", "oval", "zigzag", "spiral"]
  const shape = courseShapes[Math.floor(Math.random() * courseShapes.length)]
  
  const obstacles: ObstacleData[] = []
  const positions: [number, number, number][] = []
  
  // Generate positions based on course shape
  for (let i = 0; i < numObstacles; i++) {
    const t = i / (numObstacles - 1) // 0 to 1
    let x: number, z: number
    
    switch (shape) {
      case "figure8":
        // Figure 8 pattern
        const angle8 = t * Math.PI * 2
        if (t < 0.5) {
          x = Math.sin(angle8 * 2) * (arenaWidth / 2 - margin) * 0.6
          z = Math.cos(angle8 * 2) * (arenaHeight / 2 - margin) * 0.6 + (arenaHeight / 4)
        } else {
          x = Math.sin(angle8 * 2) * (arenaWidth / 2 - margin) * 0.6
          z = -Math.cos(angle8 * 2) * (arenaHeight / 2 - margin) * 0.6 - (arenaHeight / 4)
        }
        break
        
      case "serpentine":
        // S-curve serpentine
        x = (t - 0.5) * (arenaWidth - margin * 2)
        z = Math.sin(t * Math.PI * 2.5) * (arenaHeight / 2 - margin)
        break
        
      case "oval":
        // Oval with varying radius
        const angleOval = t * Math.PI * 2 - Math.PI / 2
        x = Math.cos(angleOval) * (arenaWidth / 2 - margin) * 0.8
        z = Math.sin(angleOval) * (arenaHeight / 2 - margin) * 0.8
        break
        
      case "zigzag":
        // Zigzag pattern
        x = (t - 0.5) * (arenaWidth - margin * 2)
        z = (i % 2 === 0 ? 1 : -1) * (arenaHeight / 2 - margin) * 0.7
        break
        
      case "spiral":
      default:
        // Spiral inward/outward
        const angleSpiral = t * Math.PI * 3
        const radius = (1 - t * 0.5) * Math.min(arenaWidth, arenaHeight) / 2 - margin
        x = Math.cos(angleSpiral) * radius * 0.8
        z = Math.sin(angleSpiral) * radius * 0.8
        break
    }
    
    // Add some randomness
    x += (Math.random() - 0.5) * 4
    z += (Math.random() - 0.5) * 4
    
    // Clamp to arena bounds
    x = Math.max(-arenaWidth/2 + margin, Math.min(arenaWidth/2 - margin, x))
    z = Math.max(-arenaHeight/2 + margin, Math.min(arenaHeight/2 - margin, z))
    
    // Round to grid
    x = Math.round(x * 2) / 2
    z = Math.round(z * 2) / 2
    
    positions.push([x, 0, z])
  }
  
  // Ensure minimum distance between obstacles (FEI rule)
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1]
    const curr = positions[i]
    const dist = Math.sqrt(Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[2] - prev[2], 2))
    
    if (dist < minDistance) {
      // Adjust position to maintain minimum distance
      const angle = Math.atan2(curr[2] - prev[2], curr[0] - prev[0])
      positions[i] = [
        prev[0] + Math.cos(angle) * minDistance,
        0,
        prev[2] + Math.sin(angle) * minDistance
      ]
    }
  }
  
  // FEI obstacle type distribution rules:
  // - No more than 2 same types in a row
  // - Water should appear only once
  // - Start with easier obstacles, harder in middle
  let lastType = ""
  let lastTypeCount = 0
  let waterUsed = false
  const hasWater = types.includes("water")
  
  for (let i = 0; i < numObstacles; i++) {
    let availableTypes = [...types]
    
    // Remove water if already used or not in allowed types
    if (waterUsed || !hasWater) {
      availableTypes = availableTypes.filter(t => t !== "water")
    }
    
    // Avoid 3 same types in a row
    if (lastTypeCount >= 2) {
      availableTypes = availableTypes.filter(t => t !== lastType)
    }
    
    // First and last obstacles should be simpler (rails or gate)
    if (i === 0 || i === numObstacles - 1) {
      availableTypes = availableTypes.filter(t => ["rails", "gate", "plank"].includes(t))
    }
    
    // Middle obstacles can be harder
    if (i > 0 && i < numObstacles - 1) {
      // Prefer harder obstacles in middle
      const hardTypes = availableTypes.filter(t => ["oxer", "triple-bar", "wall"].includes(t))
      if (hardTypes.length > 0 && Math.random() > 0.4) {
        availableTypes = hardTypes
      }
    }
    
    const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)]
    
    if (selectedType === lastType) {
      lastTypeCount++
    } else {
      lastType = selectedType
      lastTypeCount = 1
    }
    
    if (selectedType === "water") {
      waterUsed = true
    }
    
    // FEI height rules - vary heights
    const baseHeight = 1.0
    const heightVariation = (Math.random() - 0.5) * 0.4
    const height = selectedType === "water" ? undefined : Math.round((baseHeight + heightVariation) * 10) / 10
    
    obstacles.push({
      id: i + 1,
      type: selectedType,
      position: positions[i],
      status: "pending",
      height
    })
  }
  
  // Calculate start and finish positions based on first and last obstacles
  const firstPos = positions[0]
  const lastPos = positions[positions.length - 1]
  
  // Start position - before first obstacle in approach direction
  const startDir = positions.length > 1 
    ? Math.atan2(positions[1][2] - firstPos[2], positions[1][0] - firstPos[0])
    : 0
  const start: [number, number, number] = [
    Math.round((firstPos[0] - Math.cos(startDir) * 6) * 2) / 2,
    0,
    Math.round((firstPos[2] - Math.sin(startDir) * 6) * 2) / 2
  ]
  
  // Finish position - after last obstacle
  const finishDir = positions.length > 1
    ? Math.atan2(lastPos[2] - positions[positions.length - 2][2], lastPos[0] - positions[positions.length - 2][0])
    : 0
  const finish: [number, number, number] = [
    Math.round((lastPos[0] + Math.cos(finishDir) * 6) * 2) / 2,
    0,
    Math.round((lastPos[2] + Math.sin(finishDir) * 6) * 2) / 2
  ]
  
  return { obstacles, start, finish }
}

// מסלול בצורת S - המכשולים מסודרים לפי סדר הקפיצה
// הזווית מחושבת אוטומטית לפי כיוון המסלול (90 מעלות לכיוון התנועה)
const defaultObstacles: ObstacleData[] = [
  { id: 1, type: "rails", position: [-20, 0, 12], status: "pending", height: 1.2 },
  { id: 2, type: "oxer", position: [-10, 0, 10], status: "pending", height: 1.1 },
  { id: 3, type: "wall", position: [0, 0, 6], status: "pending", height: 1.0 },
  { id: 4, type: "water", position: [10, 0, 2], status: "pending" },
  { id: 5, type: "gate", position: [18, 0, -4], status: "pending", height: 1.1 },
  { id: 6, type: "triple-bar", position: [12, 0, -10], status: "pending", height: 1.0 },
  { id: 7, type: "plank", position: [2, 0, -12], status: "pending", height: 1.1 },
  { id: 8, type: "rails", position: [-8, 0, -10], status: "pending", height: 1.2 },
  { id: 9, type: "oxer", position: [-16, 0, -6], status: "pending", height: 1.1 },
  { id: 10, type: "gate", position: [-20, 0, 0], status: "pending", height: 1.1 },
]

interface ArenaMapProps {
  obstacleStatuses?: { id: number; status: "pending" | "clear" | "knockdown" }[]
  onObstacleClick?: (id: number) => void
}

export function ArenaMap({ obstacleStatuses = [], onObstacleClick }: ArenaMapProps) {
  const [showPath, setShowPath] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedObstacleId, setSelectedObstacleId] = useState<number | null>(null)
  const [obstacles, setObstacles] = useState<ObstacleData[]>(defaultObstacles)
  const [startPosition, setStartPosition] = useState<[number, number, number]>([-25, 0, 15])
  const [finishPosition, setFinishPosition] = useState<[number, number, number]>([-25, 0, -15])
  const [selectedFlag, setSelectedFlag] = useState<"start" | "finish" | null>(null)
  const [courseObstacleCount, setCourseObstacleCount] = useState(10)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(["rails", "oxer", "wall", "gate", "triple-bar", "plank"]) // water excluded by default
  )

  // Toggle obstacle type selection
  const toggleObstacleType = useCallback((type: string) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(type)) {
        // Don't allow less than 2 types
        if (newSet.size > 2) {
          newSet.delete(type)
        }
      } else {
        newSet.add(type)
      }
      return newSet
    })
  }, [])

  // Generate new FEI course with selected types
  const handleGenerateCourse = useCallback(() => {
    const allowedTypes = Array.from(selectedTypes) as ObstacleData["type"][]
    const { obstacles: newObstacles, start, finish } = generateFEICourse(courseObstacleCount, allowedTypes)
    setObstacles(newObstacles)
    setStartPosition(start)
    setFinishPosition(finish)
    setSelectedObstacleId(null)
    setSelectedFlag(null)
  }, [courseObstacleCount, selectedTypes])

  // Merge external statuses with internal obstacles
  const mergedObstacles: ObstacleData[] = obstacles.map((obstacle) => {
    const statusInfo = obstacleStatuses.find((s) => s.id === obstacle.id)
    return {
      ...obstacle,
      status: statusInfo?.status || obstacle.status,
    }
  })

  const selectedObstacle = mergedObstacles.find(o => o.id === selectedObstacleId)

  const clearCount = mergedObstacles.filter((o) => o.status === "clear").length
  const knockdownCount = mergedObstacles.filter((o) => o.status === "knockdown").length
  const pendingCount = mergedObstacles.filter((o) => o.status === "pending").length

  const handleAddObstacle = useCallback(() => {
    const newId = Math.max(...obstacles.map(o => o.id), 0) + 1
    const lastObstacle = obstacles[obstacles.length - 1]
    const newPosition: [number, number, number] = lastObstacle 
      ? [lastObstacle.position[0] + 5, 0, lastObstacle.position[2]]
      : [0, 0, 0]
    
    const newObstacle: ObstacleData = {
      id: newId,
      type: "rails",
      position: newPosition,
      status: "pending",
      height: 1.2,
    }
    setObstacles(prev => [...prev, newObstacle])
    setSelectedObstacleId(newId)
  }, [obstacles])

  const handleDeleteObstacle = useCallback((id: number) => {
    setObstacles(prev => prev.filter(o => o.id !== id))
    if (selectedObstacleId === id) {
      setSelectedObstacleId(null)
    }
  }, [selectedObstacleId])

  const handleUpdateObstacle = useCallback((id: number, updates: Partial<ObstacleData>) => {
    setObstacles(prev => prev.map(o => 
      o.id === id ? { ...o, ...updates } : o
    ))
  }, [])

  const handleMoveObstacle = useCallback((id: number, direction: 'x+' | 'x-' | 'z+' | 'z-', amount: number = 2) => {
    setObstacles(prev => prev.map(o => {
      if (o.id !== id) return o
      const [x, y, z] = o.position
      switch (direction) {
        case 'x+': return { ...o, position: [Math.min(x + amount, 26), y, z] as [number, number, number] }
        case 'x-': return { ...o, position: [Math.max(x - amount, -26), y, z] as [number, number, number] }
        case 'z+': return { ...o, position: [x, y, Math.min(z + amount, 16)] as [number, number, number] }
        case 'z-': return { ...o, position: [x, y, Math.max(z - amount, -16)] as [number, number, number] }
        default: return o
      }
    }))
  }, [])

  const handleRotateObstacle = useCallback((id: number, amount: number) => {
    setObstacles(prev => prev.map(o => 
      o.id === id ? { ...o, rotation: (o.rotation || 0) + amount } : o
    ))
  }, [])

  const handleResetObstacles = useCallback(() => {
    setObstacles(defaultObstacles)
    setSelectedObstacleId(null)
  }, [])

  const handleObstacleSelect = useCallback((id: number) => {
    if (editMode) {
      setSelectedObstacleId(prev => prev === id ? null : id)
    } else {
      onObstacleClick?.(id)
    }
  }, [editMode, onObstacleClick])

  return (
    <div className={cn(
      "flex flex-col",
      isFullscreen ? "fixed inset-0 z-50 bg-background" : "h-[700px]"
    )}>
      <div className="flex items-center justify-between p-3 bg-card/90 backdrop-blur-sm border-b border-border/50 rounded-t-xl">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-foreground text-lg">מפת הזירה 3D</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 text-green-400 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              נקי: {clearCount}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 text-red-400 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              הפלה: {knockdownCount}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-500/20 text-gray-400 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              המתנה: {pendingCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setEditMode(!editMode)
              if (editMode) setSelectedObstacleId(null)
            }}
            className="gap-2"
          >
            {editMode ? <MousePointer className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            {editMode ? "מצב צפייה" : "מצב עריכה"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPath(!showPath)}
            className="gap-2"
          >
            {showPath ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPath ? "הסתר מסלול" : "הצג מסלול"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetObstacles}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            איפוס
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="gap-2"
          >
            <Maximize2 className="w-4 h-4" />
            {isFullscreen ? "צמצם" : "מסך מלא"}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-row-reverse relative">
        {editMode && (
          <div className="w-72 min-w-72 bg-card/95 backdrop-blur-sm border-r border-border/50 p-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                <h4 className="text-sm font-semibold mb-3 text-primary">בנה מסלול FEI</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">מספר מכשולים</label>
                    <input
                      type="number"
                      min={4}
                      max={20}
                      value={courseObstacleCount}
                      onChange={(e) => setCourseObstacleCount(Math.max(4, Math.min(20, parseInt(e.target.value) || 10)))}
                      className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">סוגי מכשולים</label>
                    <div className="grid grid-cols-2 gap-1">
                      {obstacleTypes.map(type => (
                        <button
                          key={type.value}
                          onClick={() => toggleObstacleType(type.value)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                            selectedTypes.has(type.value)
                              ? "bg-secondary text-foreground border border-primary/50"
                              : "bg-muted/30 text-muted-foreground border border-transparent"
                          }`}
                        >
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: type.color }}
                          />
                          {type.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      נבחרו {selectedTypes.size} סוגים (מינימום 2)
                    </p>
                  </div>
                  
                  <Button 
                    onClick={handleGenerateCourse} 
                    className="w-full gap-2 bg-primary hover:bg-primary/90"
                  >
                    <Layers className="w-4 h-4" />
                    בנה מסלול חדש
                  </Button>
                </div>
              </div>

              <div className="border-t border-border/50 pt-4">
                <Button 
                  onClick={handleAddObstacle} 
                  className="w-full gap-2 mb-2"
                  variant="outline"
                >
                  <Plus className="w-4 h-4" />
                  הוסף מכשול חדש
                </Button>

                <Button 
                  onClick={() => {
                    setStartPosition([-25, 0, 15])
                    setFinishPosition([-25, 0, -15])
                    setSelectedFlag(null)
                  }} 
                  className="w-full gap-2"
                  variant="outline"
                >
                  <Flag className="w-4 h-4" />
                  אפס דגלי התחלה/סיום
                </Button>
              </div>

              {selectedFlag && (
                <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
                  <h4 className="text-sm font-semibold mb-2">
                    דגל {selectedFlag === "start" ? "התחלה" : "סיום"} נבחר
                  </h4>
                  <p className="text-xs text-muted-foreground">גרור את הדגל בזירה או לחץ מחוץ לו לביטול הבחירה</p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  רשימת מכשולים ({obstacles.length})
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {obstacles.map(obs => (
                    <div 
                      key={obs.id}
                      onClick={() => setSelectedObstacleId(obs.id)}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                        selectedObstacleId === obs.id 
                          ? "bg-primary/20 border border-primary/50" 
                          : "bg-secondary/50 hover:bg-secondary"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: obstacleTypes.find(t => t.value === obs.type)?.color }}
                        />
                        <span className="text-sm">#{obs.id} - {obstacleTypes.find(t => t.value === obs.type)?.label}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-400 hover:text-red-500 hover:bg-red-500/20"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteObstacle(obs.id)
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {selectedObstacle && (
                <div className="space-y-4 p-4 bg-secondary/30 rounded-xl border border-border/50">
                  <h4 className="font-semibold text-foreground flex items-center justify-between">
                    <span>עריכת מכשול #{selectedObstacle.id}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-red-400 hover:text-red-500"
                      onClick={() => handleDeleteObstacle(selectedObstacle.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </h4>

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">סוג מכשול</label>
                    <Select
                      value={selectedObstacle.type}
                      onValueChange={(value) => handleUpdateObstacle(selectedObstacle.id, { 
                        type: value as ObstacleData['type'] 
                      })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {obstacleTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <span 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: type.color }}
                              />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Move className="w-4 h-4" />
                      מיקום
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveObstacle(selectedObstacle.id, 'z-')}
                        className="col-start-2"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveObstacle(selectedObstacle.id, 'x-')}
                      >
                        <ChevronUp className="w-4 h-4 -rotate-90" />
                      </Button>
                      <div className="flex items-center justify-center text-xs text-muted-foreground">
                        {selectedObstacle.position[0].toFixed(0)}, {selectedObstacle.position[2].toFixed(0)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveObstacle(selectedObstacle.id, 'x+')}
                      >
                        <ChevronUp className="w-4 h-4 rotate-90" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveObstacle(selectedObstacle.id, 'z+')}
                        className="col-start-2"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <RotateCw className="w-4 h-4" />
                      סיבוב: {Math.round((selectedObstacle.rotation || 0) * 180 / Math.PI)}°
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRotateObstacle(selectedObstacle.id, -Math.PI / 12)}
                        className="flex-1"
                      >
                        <RotateCw className="w-4 h-4 -scale-x-100" />
                        -15°
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRotateObstacle(selectedObstacle.id, Math.PI / 12)}
                        className="flex-1"
                      >
                        <RotateCw className="w-4 h-4" />
                        +15°
                      </Button>
                    </div>
                    <Slider
                      value={[(selectedObstacle.rotation || 0) * 180 / Math.PI]}
                      min={-180}
                      max={180}
                      step={5}
                      onValueChange={([value]) => handleUpdateObstacle(selectedObstacle.id, { 
                        rotation: value * Math.PI / 180 
                      })}
                      className="mt-2"
                    />
                  </div>

                  {selectedObstacle.type !== 'water' && (
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <ChevronUp className="w-4 h-4" />
                          גובה
                        </span>
                        <span className="text-foreground font-mono">
                          {((selectedObstacle.height || 1) * 100).toFixed(0)} ס"מ
                        </span>
                      </label>
                      <Slider
                        value={[(selectedObstacle.height || 1) * 100]}
                        min={60}
                        max={160}
                        step={5}
                        onValueChange={([value]) => handleUpdateObstacle(selectedObstacle.id, { 
                          height: value / 100 
                        })}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">סטטוס</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'pending', label: 'ממתין', color: 'bg-gray-500' },
                        { value: 'clear', label: 'נקי', color: 'bg-green-500' },
                        { value: 'knockdown', label: 'הפלה', color: 'bg-red-500' },
                      ].map(status => (
                        <Button
                          key={status.value}
                          variant={selectedObstacle.status === status.value ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleUpdateObstacle(selectedObstacle.id, { 
                            status: status.value as ObstacleData['status']
                          })}
                          className="flex-1 gap-1"
                        >
                          <span className={cn("w-2 h-2 rounded-full", status.color)} />
                          {status.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!selectedObstacle && (
                <div className="p-4 bg-secondary/30 rounded-xl text-center text-sm text-muted-foreground">
                  <p>לחץ על מכשול בזירה או ברשימה כדי לערוך אותו</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 relative">
          <Arena3D
            obstacles={mergedObstacles}
            onObstacleClick={handleObstacleSelect}
            onObstacleMove={(id, position) => {
              if (editMode) {
                handleUpdateObstacle(id, { position })
              }
            }}
            showPath={showPath}
            selectedObstacle={selectedObstacleId}
            editMode={editMode}
            onSelectObstacle={(id) => {
              if (editMode) {
                setSelectedObstacleId(id)
                setSelectedFlag(null)
              } else if (id !== null) {
                onObstacleClick?.(id)
              }
            }}
            startPosition={startPosition}
            finishPosition={finishPosition}
            selectedFlag={selectedFlag}
            onStartMove={(pos) => editMode && setStartPosition(pos)}
            onFinishMove={(pos) => editMode && setFinishPosition(pos)}
            onFlagSelect={(flag) => {
              if (editMode) {
                setSelectedFlag(flag)
                setSelectedObstacleId(null)
              }
            }}
          />

          {!editMode && (
            <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur-sm border border-border/50 rounded-xl p-4 shadow-xl">
              <h4 className="text-xs font-semibold text-muted-foreground mb-3">סוגי מכשולים</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {obstacleTypes.map(type => (
                  <div key={type.value} className="flex items-center gap-2">
                    <span 
                      className="w-3 h-3 rounded-full shadow-sm" 
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="text-foreground">{type.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border/50 rounded-xl px-4 py-2 shadow-xl">
            <p className="text-xs text-muted-foreground">
              {editMode 
                ? "לחץ על מכשול לבחירה | השתמש בפאנל לעריכה" 
                : "גרור לסיבוב | גלגל לזום | Shift+גרור להזזה"
              }
            </p>
          </div>

          {editMode && (
            <div className="absolute top-4 left-4 bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl shadow-xl flex items-center gap-2">
              <Edit3 className="w-4 h-4" />
              <span className="text-sm font-medium">מצב עריכה פעיל</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
