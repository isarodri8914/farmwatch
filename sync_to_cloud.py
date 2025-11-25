import pymysql
import time
import random
import datetime
import socket

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3308,
    "user": "admin",
    "password": "Jihr8914.",
    "database": "farmwatch",
    "cursorclass": pymysql.cursors.DictCursor
}

def is_internet_available():
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=3)
        return True
    except OSError:
        try:
            socket.create_connection(("2001:4860:4860::8888", 53), timeout=3)
            return True
        except OSError:
            return False

def get_cloud_connection():
    return pymysql.connect(**DB_CONFIG)

# Loop principal
while True:
    if is_internet_available():
        print("🌐 Internet disponible, enviando datos directamente a la nube...")
        conn = None
        try:
            conn = get_cloud_connection()
            with conn.cursor() as cur:
                id_vaca = f"V-{random.randint(1,10)}"
                temperatura = round(random.uniform(35.0, 39.0), 2)
                humedad = round(random.uniform(40.0, 60.0), 2)
                ritmo_cardiaco = round(random.uniform(60.0, 100.0), 2)
                movimiento = round(random.uniform(0.0, 10.0), 2)
                latitud = 20.946033
                longitud = -89.637785
                fecha = datetime.datetime.now()

                cur.execute("""
                    INSERT INTO datos (id_vaca, temperatura, humedad, ritmo_cardiaco, movimiento, latitud, longitud, fecha)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """, (id_vaca, temperatura, humedad, ritmo_cardiaco, movimiento, latitud, longitud, fecha))
                
                conn.commit()
                print(f"✅ Dato guardado: {id_vaca}, {temperatura}°C, {humedad}%, {fecha}")
        except Exception as e:
            print(f"❌ Error al guardar: {e}")
        finally:
            if conn:
                conn.close()
    else:
        print("⚠️ Sin conexión a Internet, esperando...")

    time.sleep(10)
