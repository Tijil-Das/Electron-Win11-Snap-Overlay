{
  "targets": [
    {
      "target_name": "snap_overlay",
      "conditions": [
        ["OS=='win'", {
          "sources": [ "src/native/snap_overlay.cpp" ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "defines": [
            "UNICODE",
            "_UNICODE",
            "WIN32_LEAN_AND_MEAN",
            "NOMINMAX",
            "NAPI_DISABLE_CPP_EXCEPTIONS"
          ],
          "libraries": [
            "user32.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": [ "/std:c++17" ]
            }
          }
        }, {
          "sources": [ "src/native/dummy.cpp" ]
        }]
      ]
    }
  ]
}
