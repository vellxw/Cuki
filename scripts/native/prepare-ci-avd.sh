#!/usr/bin/env bash
# Only prepares the ephemeral CI emulator. No production package or data is touched.
set -euo pipefail
: "${ANDROID_HOME:?Android SDK is required}"
: "${GITHUB_PATH:?This provisioning script is for GitHub CI}"
export ANDROID_USER_HOME=/tmp/cuki-owned-android-user
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
test -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
mkdir -p "$ANDROID_AVD_HOME" artifacts/native/driver
printf '%s\n' "$ANDROID_HOME/cmdline-tools/latest/bin" "$ANDROID_HOME/platform-tools" "$ANDROID_HOME/emulator" >> "$GITHUB_PATH"
printf 'ANDROID_USER_HOME=%s\nANDROID_AVD_HOME=%s\nANDROID_SERIAL=emulator-5554\n' "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME" >> "$GITHUB_ENV"
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=kvm
python3 -m venv /tmp/cuki-native-driver
/tmp/cuki-native-driver/bin/python -m pip install uiautomator2==3.7.0
/tmp/cuki-native-driver/bin/python -m pip freeze > artifacts/native/driver/python-packages.txt
echo /tmp/cuki-native-driver/bin >> "$GITHUB_PATH"
# sdkmanager closes stdin after reading its responses; SIGPIPE from yes is expected.
set +o pipefail
yes | sdkmanager --licenses > /dev/null
set -o pipefail
sdkmanager --install emulator platform-tools 'system-images;android-35;google_apis;x86_64' > artifacts/native/driver/sdk-setup.log
echo no | avdmanager create avd --force -n cuki-proof --package 'system-images;android-35;google_apis;x86_64' --device pixel_6 -p "$ANDROID_AVD_HOME/cuki-proof.avd"
test -f "$ANDROID_AVD_HOME/cuki-proof.avd/config.ini"
printf 'hw.cpu.ncore=2\nhw.ramSize=3072\nhw.heapSize=512\n' >> "$ANDROID_AVD_HOME/cuki-proof.avd/config.ini"
emulator -list-avds | tee artifacts/native/driver/available-avds.txt
grep -Fx cuki-proof artifacts/native/driver/available-avds.txt
adb start-server
