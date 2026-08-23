import type { Pose2 } from './raster-asset.js';
import type { Pose3 } from './solid-asset.js';

export type AssetInstanceId = string;
export type AssetInstancePose = Pose2 | Pose3;

/**
 * Serializable mutable state for one runtime projection of an immutable
 * blueprint. Transform values are expressed in world space.
 */
export type AssetInstanceState<TPose extends AssetInstancePose> = Readonly<{
  id: AssetInstanceId;
  assetId: string;
  transform: TPose;
  interactionStates: Readonly<Record<string, string>>;
  playbackTime: number;
}>;

export type AssetInstance<TPose extends AssetInstancePose> = Readonly<{
  instanceId: AssetInstanceId;
  assetId: string;
  getInstanceState: () => AssetInstanceState<TPose>;
  getSocketWorldPose: (socketId: string) => TPose | null;
  getInteractionState: (interactionId: string) => string | null;
  setWorldPose: (pose: TPose) => void;
  setPlaybackTime: (time: number) => void;
  setInteractionState: (interactionId: string, state: string) => void;
  dispose: () => void;
}>;

export type RasterAssetInstance = AssetInstance<Pose2> & Readonly<{
  dimension: '2d';
  setDrawRank: (rank: number) => void;
}>;

export type SolidAssetInstance = AssetInstance<Pose3> & Readonly<{
  dimension: '3d';
}>;

export type AnyAssetInstance = RasterAssetInstance | SolidAssetInstance;
