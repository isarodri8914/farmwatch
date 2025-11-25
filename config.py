import os

class Config:
    MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
    MYSQL_USER = os.getenv("MYSQL_USER", "admin")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "Jihr8914.")
    MYSQL_DB = os.getenv("MYSQL_DB", "farmwatch")
    MYSQL_CHARSET = "utf8"
