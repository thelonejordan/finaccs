# Fix emoji encoding for icon column on MySQL
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('entities', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            # Forward: Convert icon column to utf8mb4
            sql="ALTER TABLE entities_entity MODIFY icon VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
            # Reverse: Convert back to default (not strictly needed but good practice)
            reverse_sql="ALTER TABLE entities_entity MODIFY icon VARCHAR(10);",
        ),
    ]
