"""Classification only: never dismiss an ANR belonging to CUKI or an unknown app."""
import xml.etree.ElementTree as ET


def classify_dialog(xml):
    nodes = list(ET.fromstring(xml).iter('node'))
    titles = [n.get('text', '') for n in nodes
              if n.get('package') == 'android' and n.get('resource-id') == 'android:id/alertTitle']
    if not titles:
        return None
    title = titles[0]
    if title != "Quickstep isn't responding":
        if "isn't responding" in title or 'keeps stopping' in title:
            raise RuntimeError('Native application/system failure: ' + title)
        return None
    close = next((n for n in nodes if n.get('resource-id') == 'android:id/aerr_close'
                  and n.get('package') == 'android' and n.get('clickable') == 'true'), None)
    if close is None:
        raise RuntimeError('Launcher ANR has no unambiguous system close action')
    return close
