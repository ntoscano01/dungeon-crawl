-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'victory', 'party_wiped', 'abandoned');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "seed" TEXT NOT NULL,
    "currentTileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "hpCurrent" INTEGER NOT NULL,
    "hpMax" INTEGER NOT NULL,
    "armorClass" INTEGER NOT NULL,
    "stats" JSONB NOT NULL,
    "turnOrderIndex" INTEGER,
    "isDowned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CharacterState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equippedSlot" TEXT,

    CONSTRAINT "CharacterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEffect" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "effectId" TEXT NOT NULL,
    "remainingTurns" INTEGER,

    CONSTRAINT "StatusEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapNode" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tileTemplateId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "positionX" INTEGER NOT NULL,
    "positionY" INTEGER NOT NULL,

    CONSTRAINT "MapNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapNodeContent" (
    "id" TEXT NOT NULL,
    "mapNodeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "instanceId" TEXT,
    "hpCurrent" INTEGER,
    "hpMax" INTEGER,

    CONSTRAINT "MapNodeContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapEdge" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "via" TEXT,
    "traversable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MapEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedFlag" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SharedFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnLogEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "playerInput" TEXT NOT NULL,
    "toolCall" JSONB NOT NULL,
    "toolResult" JSONB NOT NULL,
    "narration" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterState_sessionId_idx" ON "CharacterState"("sessionId");

-- CreateIndex
CREATE INDEX "CharacterItem_characterId_idx" ON "CharacterItem"("characterId");

-- CreateIndex
CREATE INDEX "StatusEffect_characterId_idx" ON "StatusEffect"("characterId");

-- CreateIndex
CREATE INDEX "MapNode_sessionId_idx" ON "MapNode"("sessionId");

-- CreateIndex
CREATE INDEX "MapNodeContent_mapNodeId_idx" ON "MapNodeContent"("mapNodeId");

-- CreateIndex
CREATE INDEX "MapEdge_sessionId_idx" ON "MapEdge"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedFlag_sessionId_key_key" ON "SharedFlag"("sessionId", "key");

-- CreateIndex
CREATE INDEX "TurnLogEntry_sessionId_turnNumber_idx" ON "TurnLogEntry"("sessionId", "turnNumber");

-- AddForeignKey
ALTER TABLE "CharacterState" ADD CONSTRAINT "CharacterState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterItem" ADD CONSTRAINT "CharacterItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CharacterState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEffect" ADD CONSTRAINT "StatusEffect_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CharacterState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapNode" ADD CONSTRAINT "MapNode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapNodeContent" ADD CONSTRAINT "MapNodeContent_mapNodeId_fkey" FOREIGN KEY ("mapNodeId") REFERENCES "MapNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapEdge" ADD CONSTRAINT "MapEdge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapEdge" ADD CONSTRAINT "MapEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "MapNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapEdge" ADD CONSTRAINT "MapEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "MapNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedFlag" ADD CONSTRAINT "SharedFlag_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnLogEntry" ADD CONSTRAINT "TurnLogEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
