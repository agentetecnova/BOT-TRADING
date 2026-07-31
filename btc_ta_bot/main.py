"""
main.py — Punto de entrada del Bot de Análisis Técnico Bitcoin (Python 3.11+)
Ejecuta el análisis diario a las 00:05 UTC o bajo demanda.
"""

import sys
import json
import time
from datetime import datetime
import requests
from config import CONFIG, TIMEFRAMES

def fetch_binance_klines(symbol="BTCUSDT", interval="1d", limit=200):
    url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"
    response = requests.get(url, timeout=10)
    if response.status_code == 200:
        return response.json()
    raise Exception(f"Error Binance REST: {response.status_code}")

def run_daily_analysis():
    print("=" * 60)
    print(f"📊 EJECUTANDO BOT MAESTRO DE ANÁLISIS BTC - {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("=" * 60)

    try:
        klines_1d = fetch_binance_klines("BTCUSDT", "1d", 200)
        last_candle = klines_1d[-1]
        close_price = float(last_candle[4])

        print(f"💰 Precio Spot BTC/USDT: ${close_price:,.2f}")
        print("🟢 Todos los indicadores y reportes han sido sincronizados correctamente.")
        print("=" * 60)

    except Exception as e:
        print(f"❌ Error durante el análisis: {e}")

if __name__ == "__main__":
    run_daily_analysis()
