
import { supabase } from "@/lib/supabase"

/**
 * Move any supported record to Trash.
 *
 * Supported types:
 * customer, bill, khata_entry, reminder, notification
 */
export async function moveToTrash({ shopId, type, id }) {
  if (!shopId || !type || !id) {
    throw new Error(
      "Missing shop ID, record type or record ID."
    )
  }

  const { data, error } = await supabase.rpc("trash_record", {
    p_shop_id: shopId,
    p_entity_type: type,
    p_entity_id: id,
  })

  if (error) {
    console.error("Move to Trash failed:", error)
    throw error
  }

  return data
}

/**
 * Restore a record from Trash.
 */
export async function restoreFromTrash(trashId) {
  if (!trashId) {
    throw new Error("Trash item ID is required.")
  }

  const { error } = await supabase.rpc("restore_trash_record", {
    p_trash_id: trashId,
  })

  if (error) {
    console.error("Restore from Trash failed:", error)
    throw error
  }

  return true
}

/**
 * Permanently delete one Trash item.
 */
export async function permanentlyDeleteTrashItem(trashId) {
  if (!trashId) {
    throw new Error("Trash item ID is required.")
  }

  const { error } = await supabase
    .from("trash_items")
    .delete()
    .eq("id", trashId)

  if (error) {
    console.error("Permanent deletion failed:", error)
    throw error
  }

  return true
}

/**
 * Permanently empty all Trash items for a shop.
 */
export async function emptyTrash(shopId) {
  if (!shopId) {
    throw new Error("Shop ID is required.")
  }

  const { error } = await supabase.rpc("empty_shop_trash", {
    p_shop_id: shopId,
  })

  if (error) {
    console.error("Empty Trash failed:", error)
    throw error
  }

  return true
}
