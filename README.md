# Quick local installation guide

```bash
# Download v0.0.5 server to shyfog-server folder
git clone --recurse-submodules -b v0.0.5 https://github.com/ShyFog/server.git shyfog-server

# Install modules and build the server
cd shyfog-server
npm install
npm run build

# Start the server
npm start
```