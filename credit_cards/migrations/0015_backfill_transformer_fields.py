# Data migration to backfill transformer fields on existing artifacts
from django.db import migrations


def backfill_artifacts(apps, schema_editor):
    """Backfill transformer fields on existing artifacts."""
    ExtractionArtifact = apps.get_model('credit_cards', 'ExtractionArtifact')

    # Mark 'transactions' artifacts as transformable
    ExtractionArtifact.objects.filter(artifact_type='transactions').update(
        is_transformable=True,
        transformer_name='icici_cc_transactions',
        content_type='csv',
    )

    # Mark 'transactions_ingestable' artifacts as transformed and link to source
    for ingestable in ExtractionArtifact.objects.filter(artifact_type='transactions_ingestable'):
        source = ExtractionArtifact.objects.filter(
            extraction=ingestable.extraction,
            artifact_type='transactions'
        ).first()
        ingestable.is_transformed = True
        ingestable.source_artifact = source
        ingestable.content_type = 'csv'
        ingestable.save()

    # Set content_type for other artifacts
    ExtractionArtifact.objects.filter(artifact_type='emi').update(content_type='csv')
    ExtractionArtifact.objects.filter(artifact_type='metadata').update(content_type='json')


def reverse_backfill(apps, schema_editor):
    """Reverse the backfill - reset all transformer fields."""
    ExtractionArtifact = apps.get_model('credit_cards', 'ExtractionArtifact')

    ExtractionArtifact.objects.all().update(
        is_transformable=False,
        is_transformed=False,
        transformer_name='',
        source_artifact=None,
        content_type='csv',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('credit_cards', '0014_add_transformer_fields'),
    ]

    operations = [
        migrations.RunPython(backfill_artifacts, reverse_backfill),
    ]
