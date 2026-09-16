package com.cuki.health

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController
import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap

internal object HealthPermissionRequests {
  val pending = ConcurrentHashMap<String, CompletableDeferred<Set<String>>>()
}

/** A private activity registers its result contract before STARTED, not when a JS tap
 * happens on an already-resumed ReactActivity. It never stores medical records. */
class CukiHealthPermissionsActivity : ComponentActivity() {
  private var delivered = false
  private val requestId: String get() = intent.getStringExtra("requestId") ?: ""
  private val launcher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
    delivered = true
    HealthPermissionRequests.pending[requestId]?.complete(granted)
    finish()
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (!HealthPermissionRequests.pending.containsKey(requestId)) { finish(); return }
    if (savedInstanceState == null) {
      val permissions = intent.getStringArrayListExtra("permissions")?.toSet() ?: emptySet()
      if (permissions.isEmpty()) { delivered = true; HealthPermissionRequests.pending[requestId]?.complete(emptySet()); finish() }
      else launcher.launch(permissions)
    }
  }
  override fun onDestroy() {
    if (isFinishing && !delivered) HealthPermissionRequests.pending[requestId]?.complete(emptySet())
    super.onDestroy()
  }
}
