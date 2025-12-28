from prometheus_client import start_http_server, Gauge
import subprocess
import time
import logging

logging.basicConfig(level=logging.INFO)

# Define metrics
GPU_UTIL = Gauge('gpu_utilization_percent', 'GPU utilization percent', ['index','name'])
GPU_MEM_TOTAL = Gauge('gpu_memory_total_mib', 'GPU total memory MiB', ['index','name'])
GPU_MEM_USED = Gauge('gpu_memory_used_mib', 'GPU used memory MiB', ['index','name'])

POLL_INTERVAL = 5
PORT = 9401


def query_nvidia_smi():
    cmd = [
        'nvidia-smi',
        '--query-gpu=index,name,memory.total,memory.used,utilization.gpu',
        '--format=csv,noheader,nounits'
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        return out.strip().splitlines()
    except subprocess.CalledProcessError as e:
        logging.error('nvidia-smi failed: %s', e.output)
        return []
    except FileNotFoundError:
        logging.error('nvidia-smi not found in container')
        return []


def parse_and_set(lines):
    for line in lines:
        parts = [p.strip() for p in line.split(',')]
        if len(parts) < 5:
            continue
        idx, name, mem_total, mem_used, util = parts[:5]
        try:
            GPU_UTIL.labels(index=idx, name=name).set(float(util))
            GPU_MEM_TOTAL.labels(index=idx, name=name).set(float(mem_total))
            GPU_MEM_USED.labels(index=idx, name=name).set(float(mem_used))
        except ValueError:
            continue


if __name__ == '__main__':
    start_http_server(PORT)
    logging.info('nvidia-smi exporter started on port %d', PORT)
    while True:
        lines = query_nvidia_smi()
        if lines:
            parse_and_set(lines)
        time.sleep(POLL_INTERVAL)
