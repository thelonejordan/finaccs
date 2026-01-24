from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('stories', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            # Convert table and icon column to utf8mb4 to support emojis
            sql=[
                "ALTER TABLE stories_story CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
                "ALTER TABLE stories_story MODIFY icon VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
            ],
            reverse_sql=[
                "ALTER TABLE stories_story CONVERT TO CHARACTER SET utf8 COLLATE utf8_unicode_ci;",
            ],
        ),
    ]
