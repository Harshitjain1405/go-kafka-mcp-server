import { runCommand } from '../utils.js';

export interface PrerequisiteStatus {
  name: string;
  installed: boolean;
  version: string;
  details: string;
}

/**
 * Check all prerequisites needed for running Go services with librdkafka on Windows.
 */
export function checkAllPrerequisites(): PrerequisiteStatus[] {
  return [
    checkGo(),
    checkGcc(),
    checkPkgConfig(),
    checkLibrdkafka(),
    checkDocker(),
    checkDockerCompose(),
    checkGit(),
  ];
}

function checkGo(): PrerequisiteStatus {
  const result = runCommand('go version');
  if (result.success) {
    const match = result.stdout.match(/go(\d+\.\d+(\.\d+)?)/);
    return {
      name: 'Go',
      installed: true,
      version: match ? match[1] : 'unknown',
      details: result.stdout,
    };
  }
  return {
    name: 'Go',
    installed: false,
    version: '',
    details: 'Go is not installed. Download from https://go.dev/dl/',
  };
}

function checkGcc(): PrerequisiteStatus {
  const result = runCommand('gcc --version');
  if (result.success) {
    const firstLine = result.stdout.split('\n')[0];
    return {
      name: 'GCC (MinGW/MSYS2)',
      installed: true,
      version: firstLine,
      details: 'GCC is available. Required for CGO (librdkafka compilation).',
    };
  }
  return {
    name: 'GCC (MinGW/MSYS2)',
    installed: false,
    version: '',
    details:
      'GCC not found. Install MSYS2 (https://www.msys2.org/) then run: pacman -S mingw-w64-x86_64-gcc. Add C:\\msys64\\mingw64\\bin to PATH.',
  };
}

function checkPkgConfig(): PrerequisiteStatus {
  const result = runCommand('pkg-config --version');
  if (result.success) {
    return {
      name: 'pkg-config',
      installed: true,
      version: result.stdout.trim(),
      details: 'pkg-config is available.',
    };
  }
  return {
    name: 'pkg-config',
    installed: false,
    version: '',
    details:
      'pkg-config not found. Install via MSYS2: pacman -S mingw-w64-x86_64-pkg-config. Or use confluent-kafka-go with static linking.',
  };
}

function checkLibrdkafka(): PrerequisiteStatus {
  // Try pkg-config first
  const pkgResult = runCommand('pkg-config --modversion rdkafka');
  if (pkgResult.success) {
    return {
      name: 'librdkafka',
      installed: true,
      version: pkgResult.stdout.trim(),
      details: 'librdkafka found via pkg-config.',
    };
  }

  // Check MSYS2 path
  const msys2Path = 'C:\\msys64\\mingw64\\lib\\librdkafka.a';
  const result = runCommand(`Test-Path "${msys2Path}"`);
  if (result.stdout.toLowerCase().includes('true')) {
    return {
      name: 'librdkafka',
      installed: true,
      version: 'found at MSYS2 path',
      details: `librdkafka found at ${msys2Path}`,
    };
  }

  return {
    name: 'librdkafka',
    installed: false,
    version: '',
    details:
      'librdkafka not found. Install via MSYS2: pacman -S mingw-w64-x86_64-librdkafka. Or use confluent-kafka-go v2 which bundles librdkafka statically.',
  };
}

function checkDocker(): PrerequisiteStatus {
  const result = runCommand('docker --version');
  if (result.success) {
    return {
      name: 'Docker',
      installed: true,
      version: result.stdout.trim(),
      details: 'Docker is available for running local Kafka.',
    };
  }
  return {
    name: 'Docker',
    installed: false,
    version: '',
    details: 'Docker not found. Install Docker Desktop for Windows: https://www.docker.com/products/docker-desktop/',
  };
}

function checkDockerCompose(): PrerequisiteStatus {
  // Docker Compose V2 (docker compose) or V1 (docker-compose)
  let result = runCommand('docker compose version');
  if (result.success) {
    return {
      name: 'Docker Compose',
      installed: true,
      version: result.stdout.trim(),
      details: 'Docker Compose V2 is available.',
    };
  }
  result = runCommand('docker-compose --version');
  if (result.success) {
    return {
      name: 'Docker Compose',
      installed: true,
      version: result.stdout.trim(),
      details: 'Docker Compose V1 is available.',
    };
  }
  return {
    name: 'Docker Compose',
    installed: false,
    version: '',
    details: 'Docker Compose not found. It is included with Docker Desktop.',
  };
}

function checkGit(): PrerequisiteStatus {
  const result = runCommand('git --version');
  if (result.success) {
    return {
      name: 'Git',
      installed: true,
      version: result.stdout.trim(),
      details: 'Git is available.',
    };
  }
  return {
    name: 'Git',
    installed: false,
    version: '',
    details: 'Git not found. Download from https://git-scm.com/download/win',
  };
}

/**
 * Setup environment variables needed for CGO + librdkafka on Windows.
 */
export function getGoKafkaEnvVars(): Record<string, string> {
  const env: Record<string, string> = {
    CGO_ENABLED: '1',
  };

  // If MSYS2 is installed, add its paths
  const msys2Bin = 'C:\\msys64\\mingw64\\bin';
  const msys2Lib = 'C:\\msys64\\mingw64\\lib';
  const msys2Include = 'C:\\msys64\\mingw64\\include';

  const currentPath = process.env.PATH || '';
  if (!currentPath.includes(msys2Bin)) {
    env.PATH = `${msys2Bin};${currentPath}`;
  }

  env.PKG_CONFIG_PATH = `${msys2Lib}/pkgconfig`;
  env.CGO_CFLAGS = `-I${msys2Include}`;
  env.CGO_LDFLAGS = `-L${msys2Lib}`;

  return env;
}
