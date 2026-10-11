output "cluster_name"     { value = module.eks.cluster_name }
output "cluster_endpoint" { value = module.eks.cluster_endpoint }
output "ecr_urls" {
  value = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}
output "rds_endpoint"    { value = aws_db_instance.main.endpoint }
output "redis_endpoint"  { value = aws_elasticache_replication_group.main.primary_endpoint_address }
output "sqs_queue_url"   { value = aws_sqs_queue.notifications.url }
output "github_actions_role_arn" { value = aws_iam_role.github_actions.arn }
