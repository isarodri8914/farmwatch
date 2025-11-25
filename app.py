# app.py (versión preparada para Cloud Run / local)
from flask import Flask, request, jsonify, render_template
import pymysql
import time
import os

app = Flask(__name__)

# Valores por defecto para desarrollo local (proxy)
DB_USER = os.environ.get("DB_USER", "admin")
DB_PASS = os.environ.get("DB_PASS", "Jihr8914.")
DB_NAME = os.environ.get("DB_NAME", "farmwatch")
CLOUD_SQL_CONNECTION_NAME = os.environ.get("CLOUD_SQL_CONNECTION_NAME", "")


def get_cloud_connection(retries=3, delay=2):
    for i in range(retries):
        try:
            # Si estamos en Cloud Run (o variable definida) usamos unix_socket
            if CLOUD_SQL_CONNECTION_NAME:
                return pymysql.connect(user=DB_USER,
                                       password=DB_PASS,
                                       db=DB_NAME,
                                       unix_socket=f"/cloudsql/{CLOUD_SQL_CONNECTION_NAME}",
                                       cursorclass=pymysql.cursors.DictCursor)
            # De lo contrario usamos host/port (ej: cloud_sql_proxy local en la Raspberry)
            return pymysql.connect(host=os.environ.get("DB_HOST", "127.0.0.1"),
                                   port=int(os.environ.get("DB_PORT", 3308)),
                                   user=DB_USER,
                                   password=DB_PASS,
                                   db=DB_NAME,
                                   cursorclass=pymysql.cursors.DictCursor)
        except pymysql.MySQLError as e:
            print(f"Error conectando a MySQL (intento {i+1}/{retries}): {e}")
            time.sleep(delay)
    raise ConnectionError("No se pudo conectar a la base de datos MySQL.")

@app.route('/')
def index():
    return render_template("index.html")

@app.route("/admin")
def admin():
    return render_template("admin.html")


@app.route('/api/enviar', methods=['POST'])
def recibir_datos():
    data = request.get_json()
    print("📩 Datos recibidos:", data)

    def safe_float(value):
        try:
            if value in ["N/A", "", None]:
                return None
            return float(value)
        except:
            return None

    conn = get_cloud_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO datos (id_vaca, temp_ambiente, temp_objeto, ritmo_cardiaco, oxigeno,
                                   gyro_x, gyro_y, gyro_z, latitud, longitud, satelites)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                data.get('id_vaca'),
                safe_float(data.get('temp_ambiente')),
                safe_float(data.get('temp_objeto')),
                safe_float(data.get('ritmo_cardiaco')),
                safe_float(data.get('oxigeno')),
                safe_float(data.get('gyro_x')),
                safe_float(data.get('gyro_y')),
                safe_float(data.get('gyro_z')),
                safe_float(data.get('latitud')),
                safe_float(data.get('longitud')),
                safe_float(data.get('satelites')),
            ))
        conn.commit()
        return jsonify({"status": "ok"}), 201
    except Exception as e:
        print("❌ Error guardando datos:", e)
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/datos', methods=['GET'])
def obtener_datos():
    conn = get_cloud_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM datos ORDER BY fecha DESC LIMIT 100")
            datos = cur.fetchall()
        return jsonify(datos)
    finally:
        conn.close()

if __name__ == '__main__':
    # Para local development deja host 0.0.0.0 y puerto 5000 (no gunicorn)
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)
