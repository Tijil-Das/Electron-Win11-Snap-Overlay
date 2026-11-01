#include <napi.h>

// Non-Windows stub — exports nothing.
// The TypeScript addonLoader detects the missing functions and
// falls back to standard CSS :hover/:active styling.
Napi::Object Init(Napi::Env env, Napi::Object exports) { return exports; }

NODE_API_MODULE(snap_overlay, Init)
