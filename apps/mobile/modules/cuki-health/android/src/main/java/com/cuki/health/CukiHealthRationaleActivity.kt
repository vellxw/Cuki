package com.cuki.health

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class CukiHealthRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val page = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 48, 32, 32); setBackgroundColor(Color.rgb(8,13,12)) }
    page.addView(TextView(this).apply {
      textSize = 24f; setTextColor(Color.WHITE); text = "CUKI · Tus datos de salud"
    })
    page.addView(TextView(this).apply {
      textSize = 17f; setTextColor(Color.rgb(214,224,218)); setPadding(0,24,0,24)
      text = "La integración es opcional. Podés autorizar por separado leer peso, consultar actividades y guardar entrenamientos. CUKI importa únicamente lo que confirmás y muestra su procedencia. Si sincronizás tu cuenta, los registros que importaste también se sincronizan.\n\nNo se calculan calorías a partir de estos permisos, no se usan los datos para publicidad y las actividades de otras aplicaciones no acreditan automáticamente un jardín. No se accede a GPS, ritmo cardíaco ni historia clínica.\n\nPodés revocar los permisos en Health Connect. Exportar o borrar tus datos de CUKI es gratis en Ajustes > Privacidad. Borrar datos de CUKI no borra los registros que otras aplicaciones guardaron en Health Connect."
    })
    page.addView(Button(this).apply { text = "Cerrar"; setOnClickListener { finish() } })
    setContentView(ScrollView(this).apply { addView(page) })
  }
}
