import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // gRPC runs only server-side; keep it out of the bundle and load the
  // .proto from disk at runtime.
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./proto/**/*"],
  },
};

export default nextConfig;
