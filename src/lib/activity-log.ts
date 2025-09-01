
'use server';

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ActivityLog } from "@/types";

/**
 * Logs an activity to the 'activityLogs' collection in Firestore.
 * @param description - A string describing the activity that occurred.
 */
export async function logActivity(description: string): Promise<void> {
  try {
    const logData: Omit<ActivityLog, 'id' | 'timestamp'> = {
      description,
      date: serverTimestamp(),
    };
    await addDoc(collection(db, "activityLogs"), logData);
  } catch (error) {
    console.error("Error logging activity:", error);
    // In a real-world app, you might want more robust error handling,
    // but for now, we'll just log it to the console.
  }
}
